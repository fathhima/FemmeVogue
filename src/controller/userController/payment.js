const Address = require("../../models/address");
const Cart = require("../../models/cart");
const Order = require("../../models/order");
const ProductVariant = require("../../models/productVarients");
const { calculateFinalPrice } = require("../../utils/offer");
const {validateCoupon} = require('../../utils/coupon')
const Coupon = require('../../models/coupon')

const loadPayment = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || !user._id) {
      return res.status(401).send('User not authenticated');
    }

    // Fetch addresses
    const addresses = await Address.find({ userId: user._id });

    // Get cart with populated details
    const cart = await Cart.find({ userId: user._id })
      .populate({
        path: 'productId',
        populate: { path: 'category' }
      })
      .populate('variantId');

    if (!cart.length) {
      return res.status(400).send('Cart is empty');
    }

    // Calculate prices with offers
    const cartItemsWithOffers = await Promise.all(
      cart.map(async (item) => {
        const priceDetails = await calculateFinalPrice(
          item.productId,
          item.variantId
        );
        return {
          ...item.toObject(),
          originalPrice: priceDetails.originalPrice || 0,
          finalPrice: priceDetails.finalPrice || 0,
          discountAmount: priceDetails.discountAmount || 0,
          hasOffer: priceDetails.hasOffer || false
        };
      })
    );

    // Calculate subtotal
    const subtotal = cartItemsWithOffers.reduce((total, item) => {
      const priceToUse = item.hasOffer ? item.finalPrice : (item.variantId?.price || 0);
      return total + (priceToUse * item.quantity);
    }, 0);

    // Get available coupons - Fixed aggregation pipeline
    const currentDate = new Date();
    const availableCoupons = await Coupon.aggregate([
      {
        $match: {
          isActive: true,
          validUntil: { $gt: currentDate },
          validFrom: { $lt: currentDate },
          minimumPurchase: { $lte: subtotal }
        }
      },
      {
        $addFields: {
          userUsage: {
            $ifNull: [
              {
                $filter: {
                  input: { $ifNull: ['$usedBy', []] },
                  as: 'usage',
                  cond: { 
                    $eq: ['$$usage.userId', user._id]
                  }
                }
              },
              []
            ]
          }
        }
      },
      {
        $addFields: {
          userUseCount: {
            $size: '$userUsage'
          }
        }
      },
      {
        $match: {
          $expr: {
            $lt: ['$userUseCount', { $ifNull: ['$userLimit', 1] }]
          }
        }
      }
    ]);

    // Calculate totals
    const shippingCharge = 99;
    const finalTotal = subtotal + shippingCharge;
    const totalSavings = cartItemsWithOffers.reduce((savings, item) => 
      savings + (item.hasOffer ? (item.discountAmount * item.quantity) : 0)
    , 0);

    // Prepare coupons with remaining uses
    const processedCoupons = availableCoupons.map(coupon => ({
      ...coupon,
      remainingUses: (coupon.userLimit || 1) - (coupon.userUseCount || 0)
    }));

    // Render the payment page
    res.render('user/payment', {
      user,
      address: addresses,
      cart: cartItemsWithOffers,
      shippingCharge,
      finalTotal,
      subtotal,
      totalSavings,
      hasOffers: cartItemsWithOffers.some(item => item.hasOffer),
      availableCoupons: processedCoupons
    });

  } catch (err) {
    console.error('Error loading payment page:', err);
    res.status(500).json({
      error: 'Error loading payment page',
      message: err.message
    });
  }
};

const placeOrderCod = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { paymentMethod, shippingAddress, couponCode } = req.body;
    console.log(couponCode);

    // Check if cart exists and has items
    const cart = await Cart.find({ userId })
      .populate({
        path: "productId",
        populate: { path: "category" },
      })
      .populate("variantId");

    if (!cart || cart.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Your cart is empty",
      });
    }

    // Calculate order items and basic totals first
    const orderItems = await Promise.all(
      cart.map(async (cartItem) => {
        const variant = await ProductVariant.findById(cartItem.variantId);

        if (!variant || variant.stock < cartItem.quantity) {
          throw new Error(
            `${cartItem.productId.name} is out of stock or has insufficient quantity`
          );
        }

        const priceDetails = await calculateFinalPrice(
          cartItem.productId,
          cartItem.variantId
        );
        const itemPrice = priceDetails.hasOffer
          ? priceDetails.finalPrice
          : cartItem.variantId.price;
        const totalItemPrice = itemPrice * cartItem.quantity;

        return {
          productId: cartItem.productId._id,
          variantId: cartItem.variantId._id,
          quantity: cartItem.quantity,
          price: itemPrice,
          totalPrice: totalItemPrice,
          originalPrice: priceDetails.originalPrice,
          discountAmount: priceDetails.hasOffer
            ? priceDetails.discountAmount
            : 0,
          hasOffer: priceDetails.hasOffer,
        };
      })
    );

    // Calculate initial totals
    const subtotal = orderItems.reduce(
      (total, item) => total + item.totalPrice,
      0
    );
    const shippingCharge = 99;
    let finalTotal = subtotal + shippingCharge;
    let totalSavings = orderItems.reduce(
      (savings, item) =>
        savings + (item.hasOffer ? item.discountAmount * item.quantity : 0),
      0
    );

    // Initialize couponDiscount outside the inner try block
    let couponDiscount = 0;
    let appliedCoupon = null;

    // Handle coupon application
    if (couponCode) {
      try {
        const coupon = await validateCoupon(couponCode, userId, subtotal);

        // Calculate coupon discount
        couponDiscount =
          coupon.discountType === "percentage"
            ? (subtotal * coupon.discountAmount) / 100
            : coupon.discountAmount;

        console.log("Initial couponDiscount:", couponDiscount);

        if (coupon.maxDiscount && couponDiscount > coupon.maxDiscount) {
          couponDiscount = coupon.maxDiscount;
        }

        console.log("Capped couponDiscount:", couponDiscount);

        finalTotal -= couponDiscount;
        totalSavings += couponDiscount;

        console.log("Final couponDiscount applied:", couponDiscount);

        // Update coupon usage for the user
        const userUsage = coupon.usedBy.find(
          (usage) => usage.userId.toString() === userId.toString()
        );

        if (userUsage) {
          // User has used this coupon before - increment their count
          await Coupon.updateOne(
            {
              _id: coupon._id,
              "usedBy.userId": userId,
            },
            {
              $inc: { "usedBy.$.useCount": 1 },
            }
          );
        } else {
          // First time user is using this coupon
          await Coupon.findByIdAndUpdate(coupon._id, {
            $push: {
              usedBy: {
                userId: userId,
                usedAt: new Date(),
                useCount: 1,
              },
            },
          });
        }

        appliedCoupon = coupon._id;
      } catch (error) {
        console.log("Coupon validation failed:", error.message);
      }
    }

    // Create order
    const order = new Order({
      userId,
      paymentMethod,
      shippingAddress,
      orderStatus: paymentMethod === "cod" ? "processing" : "pending",
      paymentStatus: paymentMethod === "cod" ? "pending" : "not-paid",
      items: orderItems,
      subtotal,
      shippingCharge,
      finalTotal,
      totalSavings,
      hasOffers: orderItems.some((item) => item.hasOffer),
      appliedCoupon,
      couponDiscount,
    });

    console.log(order);

    await order.save();

    // Update product stock
    for (const item of orderItems) {
      await ProductVariant.findByIdAndUpdate(item.variantId, {
        $inc: { stock: -item.quantity },
      });
    }

    // Clear cart
    await Cart.deleteMany({ userId });

    res.json({
      success: true,
      orderId: order._id,
    });
  } catch (error) {
    console.error("Order placement error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to place order. Please try again.",
    });
  }
};


const orderConfirm = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.session.user._id;

    // Fetch order with populated product details
    const order = await Order.findOne({ _id: orderId, userId })
      .populate({
        path: "items.productId",
        select: "name category",
        populate: { path: "category" },
      })
      .populate('appliedCoupon')
      .lean();

    if (!order) {
      return res.status(404).render("error", {
        message: "Order not found",
      });
    }

    // Calculate expected delivery date (5 days from order)
    const deliveryDate = new Date(order.orderedAt);
    deliveryDate.setDate(deliveryDate.getDate() + 5);

    // Format order items with offer details
    const formattedOrder = {
      _id: order._id,
      orderedAt: order.orderedAt,
      shippingAddress: order.shippingAddress,
      paymentMethod: order.paymentMethod,
      items: order.items.map((item) => ({
        product: {
          name: item.productId.name,
        },
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
        originalPrice: item.originalPrice,
        discountAmount: item.discountAmount,
        hasOffer: item.hasOffer,
      })),
      subtotal: order.subtotal,
      shippingCharge: order.shippingCharge,
      couponDiscount: order.appliedCoupon ? order.couponDiscount : 0,
      couponCode: order.appliedCoupon ? order.appliedCoupon.code : null,
      finalTotal: order.finalTotal,
      totalSavings: order.totalSavings,
      hasOffers: order.hasOffers,
      deliveryDate: deliveryDate,
    };

    res.render("user/order-cod", {
      order: formattedOrder,
      user: req.session.user,
    });
  } catch (error) {
    console.error("Error loading order confirmation:", error);
    res.status(500).render("error", {
      message: "Failed to load order confirmation",
    });
  }
};

module.exports = {
  loadPayment,
  placeOrderCod,
  orderConfirm,
};

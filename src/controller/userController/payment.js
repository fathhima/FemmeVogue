const Address = require("../../models/address");
const Cart = require("../../models/cart");
const Order = require("../../models/order");
const ProductVariant = require("../../models/productVarients");
const User = require('../../models/user')
const Wallet = require('../../models/wallet')
const { calculateFinalPrice } = require("../../utils/offer");
const {validateCoupon} = require('../../utils/coupon')
const Coupon = require('../../models/coupon')
const Razorpay = require('razorpay')
const crypto = require('crypto')

const razorpay = new Razorpay({
  key_id: 'rzp_test_30GZgvSGo32MQa',
  key_secret: 'QyPY3GY7fyDrdpXS6E9nyJ95'
})

const loadPayment = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || !user._id) {
      return res.status(401).send('User not authenticated');
    }

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

    const subtotal = cartItemsWithOffers.reduce((total, item) => {
      const priceToUse = item.hasOffer ? item.finalPrice : (item.variantId?.price || 0);
      return total + (priceToUse * item.quantity);
    }, 0);

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

    const shippingCharge = 99;
    const finalTotal = subtotal + shippingCharge;
    const totalSavings = cartItemsWithOffers.reduce((savings, item) => 
      savings + (item.hasOffer ? (item.discountAmount * item.quantity) : 0)
    , 0);

    const processedCoupons = availableCoupons.map(coupon => ({
      ...coupon,
      remainingUses: (coupon.userLimit || 1) - (coupon.userUseCount || 0)
    }));

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

    const subtotal = orderItems.reduce(
      (total, item) => total + item.totalPrice,
      0
    );
    const shippingCharge = 99;
    let finalTotal = subtotal + shippingCharge;

    let couponDiscount = 0;
    let appliedCoupon = null;

    if (couponCode) {
      try {
        const coupon = await validateCoupon(couponCode, userId, subtotal);

        couponDiscount =
          coupon.discountType === "percentage"
            ? (subtotal * coupon.discountAmount) / 100
            : coupon.discountAmount;

        if (coupon.maxDiscount && couponDiscount > coupon.maxDiscount) {
          couponDiscount = coupon.maxDiscount;
        }

        finalTotal -= couponDiscount;

        const userUsage = coupon.usedBy.find(
          (usage) => usage.userId.toString() === userId.toString()
        );

        if (userUsage) {
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
      hasOffers: orderItems.some((item) => item.hasOffer),
      appliedCoupon,
      couponDiscount,
    });

    await order.save();

    for (const item of orderItems) {
      await ProductVariant.findByIdAndUpdate(item.variantId, {
        $inc: { stock: -item.quantity },
      });
    }

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

    const deliveryDate = new Date(order.orderedAt);
    deliveryDate.setDate(deliveryDate.getDate() + 5);

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
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus
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

const placeOrderRazorPay = async (req, res) => {
  try {
      const userId = req.session.user._id;
      const { shippingAddress, couponCode } = req.body;

      const cart = await Cart.find({ userId })
          .populate({
              path: "productId",
              populate: { path: "category" },
          })
          .populate("variantId");

      if (!cart || cart.length === 0) {
          return res.status(400).json({
              success: false,
              message: "Your cart is empty"
          });
      }

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

    const subtotal = orderItems.reduce(
      (total, item) => total + item.totalPrice,
      0
    );
    const shippingCharge = 99;
    let finalTotal = subtotal + shippingCharge;

    let couponDiscount = 0;
    let appliedCoupon = null;

    if (couponCode) {
      try {
        const coupon = await validateCoupon(couponCode, userId, subtotal);

        couponDiscount =
          coupon.discountType === "percentage"
            ? (subtotal * coupon.discountAmount) / 100
            : coupon.discountAmount;

        if (coupon.maxDiscount && couponDiscount > coupon.maxDiscount) {
          couponDiscount = coupon.maxDiscount;
        }

        finalTotal -= couponDiscount;

        const userUsage = coupon.usedBy.find(
          (usage) => usage.userId.toString() === userId.toString()
        );

        if (userUsage) {
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

      const razorpayOrder = await razorpay.orders.create({
          amount: finalTotal * 100, 
          currency: 'INR',
          receipt: `order_${Date.now()}`,
          notes: {
              userId: userId.toString()
          }
      });

      const order = new Order({
          userId,
          paymentMethod: 'razorpay',
          shippingAddress,
          orderStatus: 'pending',
          paymentStatus: 'pending',
          items: orderItems,
          subtotal,
          shippingCharge,
          finalTotal,
          razorpayOrderId: razorpayOrder.id,
          paymentAttempts: [{
              razorpayOrderId: razorpayOrder.id,
              attemptedAt: new Date()
          }],
          appliedCoupon,
          couponDiscount,
          hasOffers: orderItems.some((item) => item.hasOffer)
      });

      await order.save();

      for (const item of orderItems) {
        await ProductVariant.findByIdAndUpdate(item.variantId, {
          $inc: { stock: -item.quantity },
        });
      }
  
      await Cart.deleteMany({ userId });

      res.json({
          success: true,
          key_id: 'rzp_test_30GZgvSGo32MQa',
          order: {
              id: razorpayOrder.id,
              amount: razorpayOrder.amount,
              currency: razorpayOrder.currency
          },
          orderId: order._id
      });

  } catch (error) {
      console.error('Create Razorpay order error:', error);
      res.status(500).json({
          success: false,
          message: 'Failed to create payment order'
      });
  }
};

const verifyPlaceOrderRazorPay = async (req, res) => {
  try {
      const {
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          orderId,
          status,
          error
      } = req.body;

      if (status === 'failed') {
          const order = await Order.findByIdAndUpdate(
              orderId,
              {
                  orderStatus: 'failed',
                  paymentStatus: 'failed',
                  $push: {
                      paymentHistory: {
                          status: 'failed',
                          razorpayOrderId: razorpay_order_id,
                          razorpayPaymentId: razorpay_payment_id || null,
                          error: error || 'Payment failed',
                          timestamp: new Date()
                      }
                  }
              },
              { new: true }
          );

          await Cart.deleteMany({ userId: order.userId });

          return res.json({
              success: true,
              orderId: orderId,
              status: 'failed'
          });
      }

      const sign = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSign = crypto
          .createHmac("sha256", 'QyPY3GY7fyDrdpXS6E9nyJ95')
          .update(sign)
          .digest("hex");

      if (razorpay_signature !== expectedSign) {
          await Order.findByIdAndUpdate(orderId, {
              orderStatus: 'failed',
              paymentStatus: 'failed',
              $push: {
                  paymentHistory: {
                      status: 'failed',
                      razorpayOrderId: razorpay_order_id,
                      razorpayPaymentId: razorpay_payment_id,
                      error: 'Invalid payment signature',
                      timestamp: new Date()
                  }
              }
          });

          return res.json({
              success: true,
              orderId: orderId,
              status: 'failed'
          });
      }

      const payment = await razorpay.payments.fetch(razorpay_payment_id);
      
      if (payment.status !== 'captured') {
          await Order.findByIdAndUpdate(orderId, {
              paymentStatus: 'failed',
              orderStatus: 'failed',
              $push: {
                  paymentHistory: {
                      status: 'failed',
                      razorpayOrderId: razorpay_order_id,
                      razorpayPaymentId: razorpay_payment_id,
                      error: `Payment not captured. Status: ${payment.status}`,
                      timestamp: new Date()
                  }
              }
          });

          return res.json({
              success: true,
              orderId: orderId,
              status: 'failed'
          });
      }

      const order = await Order.findByIdAndUpdate(
          orderId,
          {
              orderStatus: 'processing',
              paymentStatus: 'paid',
              $push: {
                  paymentHistory: {
                      status: 'success',
                      razorpayOrderId: razorpay_order_id,
                      razorpayPaymentId: razorpay_payment_id,
                      amount: payment.amount / 100,
                      timestamp: new Date()
                  }
              }
          },
          { new: true }
      );

      for (const item of order.items) {
          await ProductVariant.findByIdAndUpdate(item.variantId, {
              $inc: { stock: -item.quantity }
          });
      }

      await Cart.deleteMany({ userId: order.userId });

      res.json({
          success: true,
          orderId: orderId,
          status: 'success'
      });

  } catch (error) {
      console.error('Verify payment error:', error);
      res.status(500).json({
          success: false,
          message: 'Payment verification failed',
          error: error.message
      });
  }
};

const retryFailedPayment = async (req, res) => {
  try {
      const { orderId } = req.body;
      const userId = req.session.user._id;

      const order = await Order.findOne({ _id: orderId, userId });
      
      if (!order) {
          return res.status(404).json({
              success: false,
              message: 'Order not found'
          });
      }

      if (order.paymentStatus !== 'failed') {
          return res.status(400).json({
              success: false,
              message: 'Payment retry is only available for failed payments'
          });
      }

      const receiptId = `retry_${orderId.slice(0, 20)}_${Date.now().toString().slice(0, 10)}`;

      const razorpayOrder = await razorpay.orders.create({
          amount: order.finalTotal * 100, 
          currency: 'INR',
          receipt: receiptId,
          notes: {
              userId: userId.toString(),
              orderId: orderId
          }
      });

      await Order.findByIdAndUpdate(orderId, {
          $push: {
              paymentAttempts: {
                  razorpayOrderId: razorpayOrder.id,
                  attemptedAt: new Date()
              }
          }
      });

      res.json({
          success: true,
          key_id: 'rzp_test_30GZgvSGo32MQa',
          order: {
              id: razorpayOrder.id,
              amount: razorpayOrder.amount,
              currency: razorpayOrder.currency
          }
      });

  } catch (error) {
      console.error('Retry Razorpay payment error:', error);
      res.status(500).json({
          success: false,
          message: 'Failed to initiate payment retry'
      });
  }
};

const placeOrderWallet = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { shippingAddress, couponCode } = req.body;

    const user = await User.findById(userId);
    
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

    const subtotal = orderItems.reduce(
      (total, item) => total + item.totalPrice,
      0
    );
    const shippingCharge = 99;
    let finalTotal = subtotal + shippingCharge;

    let couponDiscount = 0;
    let appliedCoupon = null;

    if (couponCode) {
      try {
        const coupon = await validateCoupon(couponCode, userId, subtotal);

        couponDiscount =
          coupon.discountType === "percentage"
            ? (subtotal * coupon.discountAmount) / 100
            : coupon.discountAmount;

        if (coupon.maxDiscount && couponDiscount > coupon.maxDiscount) {
          couponDiscount = coupon.maxDiscount;
        }

        finalTotal -= couponDiscount;

        const userUsage = coupon.usedBy.find(
          (usage) => usage.userId.toString() === userId.toString()
        );

        if (userUsage) {
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

    if (!user.walletBalance || user.walletBalance < finalTotal) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
      });
    }

    const order = new Order({
      userId,
      paymentMethod: 'wallet',
      shippingAddress,
      orderStatus: 'processing',
      paymentStatus: 'paid',
      items: orderItems,
      subtotal,
      shippingCharge,
      finalTotal,
      hasOffers: orderItems.some((item) => item.hasOffer),
      appliedCoupon,
      couponDiscount,
    });

    await order.save();

    const transaction = new Wallet({
      userId,
      transactionId: `WD${Date.now()}`,
      type: 'debit',
      amount: finalTotal,
      status: 'success',
      orderId: order._id
    });
    await transaction.save();

    await User.findByIdAndUpdate(
      userId,
      { $inc: { walletBalance: -finalTotal } }
    );

    for (const item of orderItems) {
      await ProductVariant.findByIdAndUpdate(item.variantId, {
        $inc: { stock: -item.quantity },
      });
    }

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

module.exports = {
  loadPayment,
  placeOrderCod,
  orderConfirm,
  placeOrderRazorPay,
  verifyPlaceOrderRazorPay,
  retryFailedPayment,
  placeOrderWallet
};

const Address = require("../../models/address");
const Cart = require("../../models/cart");
const Order = require("../../models/order");
const ProductVariant = require("../../models/productVarients");
const {calculateFinalPrice} = require('../../utils/offer')

const loadPayment = async (req, res) => {
  try {
    const user = req.session.user;
    const addresses = await Address.find({ userId: user._id });
    
    // Get cart with populated details
    const cart = await Cart.find({ userId: user._id })
      .populate({
        path: "productId",
        populate: { path: "category" }
      })
      .populate("variantId");

    // Calculate prices with offers for each cart item
    const cartItemsWithOffers = await Promise.all(cart.map(async (item) => {
      const priceDetails = await calculateFinalPrice(item.productId, item.variantId);
      return {
        ...item.toObject(),
        originalPrice: priceDetails.originalPrice,
        finalPrice: priceDetails.finalPrice,
        discountAmount: priceDetails.discountAmount,
        hasOffer: priceDetails.hasOffer
      };
    }));

    // Calculate totals considering offers
    const subtotal = cartItemsWithOffers.reduce((total, item) => {
      const priceToUse = item.hasOffer ? item.finalPrice : item.variantId.price;
      return total + (priceToUse * item.quantity);
    }, 0);

    const shippingCharge = 99;
    const finalTotal = subtotal + shippingCharge;
    const totalSavings = cartItemsWithOffers.reduce((savings, item) => {
      return savings + (item.hasOffer ? item.discountAmount * item.quantity : 0);
    }, 0);

    res.render("user/payment", {
      user,
      address: addresses,
      cart: cartItemsWithOffers,
      shippingCharge,
      finalTotal,
      subtotal,
      totalSavings,
      hasOffers: cartItemsWithOffers.some(item => item.hasOffer)
    });
  } catch (err) {
    console.error("Error loading payment page:", err);
    res.status(500).send("Error loading payment page");
  }
};

const placeOrderCod = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { paymentMethod, shippingAddress } = req.body;

    // Check if cart exists and has items
    const cart = await Cart.find({ userId })
      .populate({
        path: "productId",
        populate: { path: "category" }
      })
      .populate("variantId");

    if (!cart || cart.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Your cart is empty",
      });
    }

    // Check stock and calculate prices with offers
    const orderItems = await Promise.all(cart.map(async (cartItem) => {
      const variant = await ProductVariant.findById(cartItem.variantId);
      
      if (!variant || variant.stock < cartItem.quantity) {
        throw new Error(`${cartItem.productId.name} is out of stock or has insufficient quantity`);
      }

      // Calculate final price with offers
      const priceDetails = await calculateFinalPrice(cartItem.productId, cartItem.variantId);
      const itemPrice = priceDetails.hasOffer ? priceDetails.finalPrice : cartItem.variantId.price;
      const totalItemPrice = itemPrice * cartItem.quantity;

      return {
        productId: cartItem.productId._id,
        variantId: cartItem.variantId._id,
        quantity: cartItem.quantity,
        price: itemPrice,
        totalPrice: totalItemPrice,
        originalPrice: priceDetails.originalPrice,
        discountAmount: priceDetails.hasOffer ? priceDetails.discountAmount : 0,
        hasOffer: priceDetails.hasOffer
      };
    }));

    // Calculate totals
    const subtotal = orderItems.reduce((total, item) => total + item.totalPrice, 0);
    const shippingCharge = 99;
    const finalTotal = subtotal + shippingCharge;
    const totalSavings = orderItems.reduce((savings, item) => 
      savings + (item.hasOffer ? item.discountAmount * item.quantity : 0), 0);

    // Create new order with offer details
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
      hasOffers: orderItems.some(item => item.hasOffer)
    });

    await order.save();

    // Update product stock
    for (const item of orderItems) {
      await ProductVariant.findByIdAndUpdate(item.variantId, {
        $inc: { stock: -item.quantity },
      });
    }

    // Clear cart after successful order
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
        select: "name category", // Include category for offer context
        populate: { path: "category" }
      })
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
      items: order.items.map(item => ({
        product: {
          name: item.productId.name,
        },
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
        originalPrice: item.originalPrice,
        discountAmount: item.discountAmount,
        hasOffer: item.hasOffer
      })),
      subtotal: order.subtotal,
      shippingCharge: order.shippingCharge,
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

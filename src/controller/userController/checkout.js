const Address = require("../../models/address");
const Cart = require("../../models/cart");
const {calculateFinalPrice} = require('../../utils/offer')
 
const loadAddress = async (req, res) => {
  try {
    const user = req.session.user;
    
    const addresses = await Address.find({ userId: user._id });
    
    const cart = await Cart.find({ userId: user._id })
      .populate({
        path: "productId",
        populate: { path: "category" }  
      })
      .populate("variantId");

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

    const subtotal = cartItemsWithOffers.reduce((total, item) => {
      const priceToUse = item.hasOffer ? item.finalPrice : item.variantId.price;
      return total + (priceToUse * item.quantity);
    }, 0);

    const shippingCharge = 99;
    const finalTotal = subtotal + shippingCharge;

    const totalSavings = cartItemsWithOffers.reduce((savings, item) => {
      return savings + (item.hasOffer ? item.discountAmount * item.quantity : 0);
    }, 0);

    res.render("user/checkout-address", {
      addresses,
      cart: cartItemsWithOffers,  
      user,
      subtotal,
      shippingCharge,
      finalTotal,
      totalSavings,
      hasOffers: cartItemsWithOffers.some(item => item.hasOffer)  
    });

  } catch (error) {
    console.error("Error loading checkout page:", error);
    res.status(500).send("Error loading checkout page");
  }
};

module.exports = {
  loadAddress,
};

const products = require("../../models/products");
const productVariant = require("../../models/productVarients");
const Cart = require("../../models/cart");
const {calculateFinalPrice} = require('../../utils/offer');

const loadCart = async (req, res) => {
  try {
    const user = req.session.user;
    const userId = req.session.user._id;
    
    // Populate cart with full product and variant details
    const cart = await Cart.find({ userId })
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

    // Calculate subtotal with discounted prices
    const subtotal = cartItemsWithOffers.reduce((total, item) => {
      return total + (item.hasOffer ? item.finalPrice : item.variantId.price) * item.quantity;
    }, 0);

    const shippingCharge = 99;
    const finalTotal = subtotal + shippingCharge;

    res.render("user/shopping-cart", { 
      user: user, 
      cartItems: cartItemsWithOffers, 
      total: finalTotal,
      shippingCharge: shippingCharge,
      subtotal: subtotal 
    });
  } catch (err) {
    console.error(err);
    res.status(400).send("something went wrong");
  }
};

const addToCart = async (req, res) => {
  try {
    const { productId, variantId, quantity } = req.body;
    const userId = req.session.user._id;
    const MAX_QUANTITY_PER_PERSON = 10; 

    // Validate inputs
    if (!productId || !variantId || !quantity) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid quantity",
      });
    }

    // Find product and variant
    const product = await products.findById(productId).populate("category");
    const variant = await productVariant.findById(variantId);

    if (!product || !variant) {
      return res.status(404).json({
        success: false,
        message: "Product or variant not found",
      });
    }

    // Calculate final price with offers
    const priceDetails = await calculateFinalPrice(product, variant);

    // Check existing cart item
    const cartItem = await Cart.findOne({ userId, productId, variantId });
    const currentQuantity = cartItem ? cartItem.quantity : 0;
    const newTotalQuantity = currentQuantity + quantity;

    // Check maximum quantity per person
    if (newTotalQuantity > MAX_QUANTITY_PER_PERSON) {
      return res.status(400).json({
        success: false,
        message: `You can only purchase up to ${MAX_QUANTITY_PER_PERSON} units of this item`,
      });
    }

    // Check stock
    if (variant.stock < newTotalQuantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${variant.stock} units available in stock`,
      });
    }

    // Determine price to use (discounted or original)
    const itemPrice = priceDetails.hasOffer ? priceDetails.finalPrice : variant.price;
    const totalPrice = itemPrice * quantity;

    if (cartItem) {
      // Update existing item
      cartItem.quantity = newTotalQuantity;
      cartItem.price = totalPrice;
      await cartItem.save();
    } else {
      // Create new cart item
      const newCartItem = new Cart({
        userId,
        productId,
        variantId,
        quantity,
        price: totalPrice,
      });
      await newCartItem.save();
    }

    // Send success response with offer details
    res.json({
      success: true,
      message: "Product added to cart",
      currentQuantity: newTotalQuantity,
      remainingLimit: MAX_QUANTITY_PER_PERSON - newTotalQuantity,
      priceDetails: {
        originalPrice: priceDetails.originalPrice,
        finalPrice: priceDetails.finalPrice,
        discountAmount: priceDetails.discountAmount,
        hasOffer: priceDetails.hasOffer
      }
    });
  } catch (error) {
    console.error("Error adding to cart:", error);
    res.status(500).json({
      success: false,
      message: "Error adding item to cart",
    });
  }
};

const updateCart = async (req, res) => {
  try {
    const { _id, quantity } = req.body;
    const userId = req.session.user._id;
    
    if (!_id || !quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid inputs",
      });
    }

    const cartItem = await Cart.findOne({ _id: _id, userId })
      .populate({
        path: "productId",
        populate: { path: "category" }
      })
      .populate("variantId");


    if (quantity > 10 || quantity > cartItem.variantId.stock) {
      return res.status(400).json({
        success: false,
        message: "Invalid quantity",
      });
    }

    const priceDetails = await calculateFinalPrice(cartItem.productId, cartItem.variantId);
    
    const totalPrice = priceDetails.hasOffer 
      ? priceDetails.finalPrice * quantity  
      : cartItem.variantId.price * quantity; 

    await Cart.findByIdAndUpdate(_id, {
      quantity: quantity,
      price: totalPrice
    });

    res.json({
      success: true,
      message: "Cart updated successfully",
      updatedItem: {
        quantity: quantity,
        price: totalPrice,
        originalPrice: priceDetails.originalPrice,
        finalPrice: priceDetails.finalPrice,
        discountAmount: priceDetails.discountAmount,
        hasOffer: priceDetails.hasOffer
      }
    });

  } catch (error) {
    console.log(error)
    res.status(500).json({
      success: false,
      message: "Error updating cart",
    });
  }
};

const removeItem = async (req, res) => {
  try {
    // 1. Get basic information
    const cartItemId = req.params.id;
    const userId = req.session.user._id;

    // 2. Check if item exists
    const cartItem = await Cart.findOne({ _id: cartItemId, userId });
    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: "Cart item not found",
      });
    }

    // 3. Remove the item
    await Cart.findByIdAndDelete(cartItemId);

    // 4. Get remaining cart items
    const remainingCart = await Cart.find({ userId })
      .populate({
        path: "productId",
        populate: { path: "category" }
      })
      .populate("variantId");

    // 5. Calculate prices for remaining items
    const cartItemsWithOffers = await Promise.all(remainingCart.map(async (item) => {
      // Get price details for each item
      const priceDetails = await calculateFinalPrice(item.productId, item.variantId);
      
      return {
        ...item.toObject(),
        originalPrice: priceDetails.originalPrice,
        finalPrice: priceDetails.finalPrice,
        discountAmount: priceDetails.discountAmount,
        hasOffer: priceDetails.hasOffer
      };
    }));

    // 6. Calculate total cart value
    const subtotal = cartItemsWithOffers.reduce((total, item) => {
      const priceToUse = item.hasOffer ? item.finalPrice : item.variantId.price;
      return total + (priceToUse * item.quantity);
    }, 0);

    // 7. Send response
    res.json({
      success: true,
      message: "Item removed from cart",
      remainingItems: cartItemsWithOffers,
      cartTotal: subtotal + 99 
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error removing item",
    });
  }
};

module.exports = {
  loadCart,
  addToCart,
  updateCart,
  removeItem
};

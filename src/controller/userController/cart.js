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
      // Verify productId and variantId exist to prevent errors
      if (!item.productId || !item.variantId) return null;

      const priceDetails = await calculateFinalPrice(item.productId, item.variantId);

      // Convert Mongoose document to plain object and add price details
      return {
        ...item.toObject(),
        originalPrice: priceDetails.originalPrice,
        finalPrice: priceDetails.finalPrice,
        discountAmount: priceDetails.discountAmount,
        hasOffer: priceDetails.hasOffer,
        imageUrl: item.productId.image ? item.productId.image[0] : '/path/to/default-image.jpg' // Use the first image or a default
      };
    }));

    // Filter out any null items that may have resulted from missing product/variant data
    const validCartItems = cartItemsWithOffers.filter(item => item !== null);

    // Calculate subtotal with discounted prices
    const subtotal = validCartItems.reduce((total, item) => {
      return total + (item.hasOffer ? item.finalPrice : item.variantId.price) * item.quantity;
    }, 0);

    const shippingCharge = 99;
    const finalTotal = subtotal + shippingCharge;

    res.render("user/shopping-cart", { 
      user: user, 
      cartItems: validCartItems, 
      total: finalTotal,
      shippingCharge: shippingCharge,
      subtotal: subtotal 
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong.");
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
    const cartItemId = req.params.id;
    const userId = req.session.user._id;
    const cartItem = await Cart.findOne({ _id: cartItemId, userId });
    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: "Cart item not found",
      });
    }
    await Cart.findByIdAndDelete(cartItemId);
    const remainingCart = await Cart.find({ userId })
      .populate({
        path: "productId",
        populate: { path: "category" }
      })
      .populate("variantId");
    const cartItemsWithOffers = await Promise.all(remainingCart.map(async (item) => {
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

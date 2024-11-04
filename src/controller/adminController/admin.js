const Admin = require("../../models/admin");
const User = require("../../models/user");
const Category = require("../../models/categories");
const Products = require("../../models/products");
const productVariant = require("../../models/productVarients");
const Orders = require("../../models/order");
const { validateSignUpData } = require("../../utils/validation");
const path = require("path");
const bcrypt = require("bcrypt");

const loadLogin = async (req, res) => {
  res.render("admin/login");
};

const login = async (req, res) => {
  try {
    const { emailId, password } = req.body;
    const admin = await Admin.findOne({ emailId: emailId });
    if (!admin) {
      throw new Error("invalid credentials");
    }
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (isPasswordValid) {
      req.session.admin = admin;
      res.redirect("/admin/dashboard");
    } else {
      throw new Error("invalid credentials");
    }
  } catch (err) {
    res.status(400).send("something went wrong");
  }
};

const loadDashboard = async (req, res) => {
  res.render("admin/index");
};

const users = async (req, res) => {
  try {
    const users = await User.find({ isVerified: true });
    res.render("admin/users", { users: users });
  } catch (err) {
    res.status(400).send("something went wrong");
  }
};

const usersBlock = async (req, res) => {
  const userId = req.params.userId;
  try {
    const user = await User.findByIdAndUpdate(userId, { isBlocked: true });
    if (!user) {
      throw new Error("user does not exist");
    }
    res.send({ success: true });
  } catch (err) {
    res.status(400).send("something went wrong");
  }
};

const usersUnblock = async (req, res) => {
  const userId = req.params.userId;
  try {
    const user = await User.findByIdAndUpdate(userId, { isBlocked: false });
    if (!user) {
      throw new Error("user does not exist");
    }
    res.send({ success: true });
  } catch (err) {
    res.status(400).send("something went wrong");
  }
};

const categories = async (req, res) => {
  try {
    const categories = await Category.find({});
    res.render("admin/categories", { categories: categories });
  } catch (err) {
    res.status(400).send("something went wrong");
  }
};

const categoriesAdd = async (req, res) => {
  const categoryName = req.body.name;
  try {
    const existingCategory = await Category.findOne({ name: categoryName });
    if (existingCategory) { 
      return res.status(400).json({ success: false, message: "Category already exists" });
  }
    const category = new Category({
      name: categoryName,
    });
    await category.save();
    if (!category) {
      return res
        .status(400)
        .json({ success: false, message: "category not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.log(err)
    res.status(400).send("something went wrong");
  }
};

const categoriesEdit = async (req, res) => {
  const categoryId = req.params.categoryId;
  const categoryName = req.body.name;
  try {
    const existingCategory = await Category.findOne({ name: categoryName });
    if (existingCategory) {
      return res
        .status(400)
        .json({ success: false, message: "category already exists" });
    }
    const category = await Category.findByIdAndUpdate(categoryId, {
      name: categoryName,
    });
    if (!category) {
      return res
        .status(400)
        .json({ success: false, message: "category not found" });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).send("something went wrong");
  }
};

const listUnlist = async (req, res) => {
  const categoryId = req.params.categoryId;
  try {
    const category = await Category.findById(categoryId);
    if (!category) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }

    category.isDeleted = !category.isDeleted;
    await category.save();

    res.json({
      success: true,
      message: `Category ${
        category.isDeleted ? "Unlisted" : "Listed"
      } successfully`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

const products = async (req, res) => {
  try {
    const products = await Products.find()
      .populate("category")
      .populate({
        path: "variants",
        match: { isDeleted: false },
      });
    const categories = await Category.find({});
    const productsWithVariants = await Promise.all(
      products.map(async (product) => {
        const variants = await productVariant.find({
          product: product._id,
          isDeleted: false,
        });
        return { ...product.toObject(), variants };
      })
    );
    res.render("admin/products", {
      categories,
      products: productsWithVariants,
    });
  } catch (err) {
    console.error(err);
    res.status(400).send("something went wrong");
  }
};

const productsAdd = async (req, res) => {
  try {
    const { brandName, description, category, size, price, stock, variants } =
      req.body;

    const parsedVariants = JSON.parse(variants);

    const image1 = path.join("uploads", req.files["image1"][0].filename);
    const image2 = path.join("uploads", req.files["image2"][0].filename);
    const image3 = path.join("uploads", req.files["image3"][0].filename);

    const newProduct = new Products({
      brandName,
      description,
      category,
      size,
      price,
      stock,
      image: [image1, image2, image3],
    });

    const savedProduct = await newProduct.save();

    const savedVariants = await Promise.all(
      parsedVariants.map(async (variant) => {
        const newVariant = new productVariant({
          product: savedProduct._id,
          size: variant.size,
          color: variant.color,
          price: variant.price,
          stock: variant.stock,
        });
        return await newVariant.save();
      })
    );

    savedProduct.variants = savedVariants.map((variant) => variant._id);
    await savedProduct.save();

    res.status(201).json({
      success: true,
      message: "Product added successfully",
      product: savedProduct,
      categories: categories,
    });
  } catch (error) {
    console.error("Error adding product:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add product",
      error: error.message,
    });
  }
};

const productsUpdate = async (req, res) => {
  const productId = req.params.productId;
  try {
    const updates = req.body;

    if (req.files) {
      const existingProduct = await Products.findById(productId);
      const imagePaths = [...existingProduct.image];
      if (req.files.image1) {
        imagePaths[0] = `uploads/${req.files.image1[0].filename}`;
      }
      if (req.files.image2) {
        imagePaths[1] = `uploads/${req.files.image2[0].filename}`;
      }
      if (req.files.image3) {
        imagePaths[2] = `uploads/${req.files.image3[0].filename}`;
      }
      updates.image = imagePaths;
    }

    if (updates.variants) {
      const variants = JSON.parse(updates.variants);
      const variantIds = [];

      for (let variant of variants) {
        if (variant._id) {
          await productVariant.findByIdAndUpdate(variant._id, variant, {
            new: true,
          });
          variantIds.push(variant._id);
        } else {
          const newVariant = new productVariant({
            product: productId,
            size: variant.size,
            color: variant.color,
            price: variant.price,
            stock: variant.stock,
          });
          const savedVariant = await newVariant.save();
          variantIds.push(savedVariant._id);
        }
      }
      await productVariant.deleteMany({
        product: productId,
        _id: { $nin: variantIds },
      });

      updates.variants = variantIds;
    }

    const updatedProduct = await Products.findByIdAndUpdate(
      productId,
      { $set: updates },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update product",
      error: error.message,
    });
  }
};

const productListUnlist = async (req, res) => {
  const productId = req.params.productId;
  const { isDeleted } = req.body;
  try {
    const product = await Products.findById(productId);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    product.isDeleted = isDeleted;
    await product.save();

    res.json({
      success: true,
      message: `Product ${
        product.isDeleted ? "Unlisted" : "Listed"
      } successfully`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

const loadOrders = async (req, res) => {
  const orders = await Orders.find({});
  res.render("admin/orders", { orders: orders });
};

const orderDetails = async (req, res) => {
  try {
    const order = await Orders.findById(req.params.id)
      .populate("userId", "firstName emailId")
      .populate("items.productId")
      .populate("items.variantId");

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    console.error("Get order details error:", error);
    res.status(500).json({ error: "Failed to fetch order details" });
  }
};

const orderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = [
      "pending",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const order = await Orders.findById(id).populate('items.variantId')
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Prevent status update if order is cancelled
    if (order.orderStatus === "cancelled") {
      return res.status(400).json({ error: "Cannot update cancelled order" });
    }

    if(status === "cancelled"){
      // Update stock for each item
    for (const item of order.items) {
      if (item.variantId) {
        // Log for debugging
        console.log(`Before update - Variant ${item.variantId._id}: Current stock: ${item.variantId.stock}`);
        
        // Increase the stock
        item.variantId.stock += item.quantity;
        
        console.log(`After update - Variant ${item.variantId._id}: New stock: ${item.variantId.stock}`);
        
        // Save the variant document
        await item.variantId.save();
      }
    }
      order.paymentStatus = "cancelled"
    }

    // Update payment status if order is delivered
    if (status === "delivered") {
      order.paymentStatus = "completed";
    }

    order.orderStatus = status;

    
    await order.save();

    res.json({ message: "Order status updated successfully", order });
  } catch (error) {
    console.error("Update order status error:", error);
    res.status(500).json({ error: "Failed to update order status" });
  }
};

const productCancel = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const order = await Orders.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    const orderItem = order.items.id(itemId);
    if (!orderItem) {
      return res.status(404).json({ error: "Order item not found" });
    }
    // Check if order can be modified
    if (["delivered", "cancelled"].includes(order.orderStatus)) {
      return res.status(400).json({
        error: "Cannot modify order in current status",
      });
    }

    // Return item quantity to inventory
    await productVariant.findByIdAndUpdate(
      orderItem.variantId,
      {
          $inc: { stock: orderItem.quantity }
      }
    );
    orderItem.cancelled = true;

    // Recalculate totals
    order.subtotal = order.items.reduce(
      (sum, item) => sum + item.price,
      0
    );
    order.finalTotal = order.subtotal + order.shippingCharge

    // If no items left, cancel the entire order
    if (order.items.length === 0) {
      order.orderStatus = "cancelled";
      order.paymentStatus = "cancelled";
    }

    await order.save();

    res.json({
      success: true,
      message: "Order item cancelled successfully",
      order,
    });
  } catch (error) {
    console.error("Cancel item error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to cancel order ite m",
      message: error.message,
    });
  }
};

const productStatus = async(req,res) => {
  try{
    console.log('hi')
    const {orderId,itemId} = req.params
    const {status} = req.body
    const validStatuses = ['pending', 'processing', 'shipped', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const order = await Orders.findById(orderId)
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const item = order.items.id(itemId)
    if (!item) {
      return res.status(404).json({ error: 'Order item not found' });
    }
    if (order.orderStatus === 'cancelled' || item.cancelled) {
      return res.status(400).json({ error: 'Cannot update status for cancelled items' });
    }
    item.status = status;
    // If all non-cancelled items have the same status, update the overall order status
    const nonCancelledItems = order.items.filter(item => !item.cancelled);
    const allSameStatus = nonCancelledItems.every(item => item.status === status);
    if (allSameStatus) {
      order.orderStatus = status;
    }
    await order.save();
    res.json({ message: 'Item status updated successfully', order });
  } catch (error) {
    console.error('Update item status error:', error);
    res.status(500).json({ error: 'Failed to update item status' });
  }
}

const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        res.status(400).send("something went wrong");
      }
    });
    res.redirect("/admin/login");
  } catch (err) {
    res.status(400).send("something went wrong");
  }
};

module.exports = {
  loadLogin,
  login,
  loadDashboard,
  users,
  usersBlock,
  usersUnblock,
  categories,
  categoriesAdd,
  categoriesEdit,
  listUnlist,
  products,
  productsAdd,
  productsUpdate,
  productListUnlist,
  loadOrders,
  orderDetails,
  orderStatus,
  productCancel,
  productStatus,
  logout,
};
const User = require("../../models/user");
const Address = require("../../models/address");
const Order = require("../../models/order");
const Wallet = require("../../models/wallet");
const productVarients = require("../../models/productVarients");
const {formatDate} = require('../../utils/invoice')
const Razorpay = require("razorpay");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const PDFDocument = require('pdfkit')

const razorpay = new Razorpay({
  key_id: "rzp_test_30GZgvSGo32MQa",
  key_secret: "QyPY3GY7fyDrdpXS6E9nyJ95",
});

const profile = async (req, res) => {
  try {
    const user = req.session.user;
    res.render("user/layout", { page: "profile", user });
  } catch (err) {
    console.error(err);
    res.status(400).send("something went wrong");
  }
};

const profileUpdate = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { firstName, lastName, phone } = req.body;

    // Validation
    if (!firstName || !lastName || !phone) {
      return res.json({
        success: false,
        message: "All fields are required",
      });
    }

    // Phone number validation (10 digits)
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.json({
        success: false,
        message: "Please enter a valid 10-digit phone number",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.json({
        success: false,
        message: "User not found",
      });
    }

    // Update session
    req.session.user = {
      ...req.session.user,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      phone: updatedUser.phone,
    };

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        phone: updatedUser.phone,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(400).send("something went wrong");
  }
};

const showPassword = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.googleId) {
      return res.json({
        googleId: user.googleId,
        password: user.password,
      });
    }
    return res.json({
      googleId: null,
    });
  } catch (error) {
    console.error("Error fetching user info:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (user.googleId) {
      if (currentPassword !== user.password) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect",
        });
      }
    } else {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect",
        });
      }
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Password change error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating password",
    });
  }
};

const address = async (req, res) => {
  try {
    const user = req.session.user;
    const addresses = await Address.find({ userId: user._id });
    res.render("user/layout", { page: "address", addresses, user });
  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong");
  }
};

const addressNew = async (req, res) => {
  try {
    const user = req.session.user;

    if (req.body.isDefault) {
      await Address.updateMany({ userId: user._id }, { isDefault: false });
    }

    const address = new Address({
      ...req.body,
      userId: user._id,
    });

    await address.save();
    await User.findByIdAndUpdate(
      user._id,
      {
        $push: {
          addresses: address._id,
        },
      },
      { new: true }
    );
    res.status(201).json(address);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error creating address" });
  }
};

const addressEdit = async (req, res) => {
  try {
    const user = req.session.user;

    const addressId = req.params.id;

    if (req.body.isDefault) {
      await Address.updateMany({ userId: user._id }, { isDefault: false });
    }

    const address = await Address.findOneAndUpdate(
      { _id: addressId, userId: user._id },
      req.body,
      { new: true }
    );

    if (!address) {
      return res.status(404).json({ error: "Address not found" });
    }

    res.json(address);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error updating address" });
  }
};

const addressDelete = async (req, res) => {
  try {
    const user = req.session.user;
    const addressId = req.params.id;

    const address = await Address.findOneAndDelete({
      _id: addressId,
      userId: user._id,
    });

    if (!address) {
      return res.status(404).json({ error: "Address not found" });
    }
    await User.findByIdAndUpdate(user._id, {
      $pull: {
        addresses: address._id,
      },
    });
    res.json({ message: "Address deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error deleting address" });
  }
};

const orders = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const orders = await Order.find({ userId })
      .populate("items.productId")
      .sort({ orderedAt: -1 });
    res.render("user/layout", {
      page: "orders",
      orders,
      user: req.session.user,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).send("Error fetching orders");
  }
};

const cancelOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.session.user._id;
    const { reason } = req.body;

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.orderStatus === "pending" || order.orderStatus === "processing") {
      order.orderStatus = "cancelled";
      order.paymentStatus = "cancelled";

      for (const item of order.items) {
        item.cancelReason = reason;
        item.status = "cancelled";
        const productVariant = await productVarients.findById(item.variantId);
        productVariant.stock += item.quantity;
        await productVariant.save();
      }
      if (
        order.paymentMethod === "wallet" ||
        order.paymentMethod === "razorpay"
      ) {
        await User.findByIdAndUpdate(userId, {
          $inc: {
            walletBalance: order.finalTotal,
          },
        });
      }

      const walletTransaction = new Wallet({
        userId: userId,
        transactionId: `WL${Date.now()}`,
        type: "refund",
        amount: order.finalTotal,
        status: "success",
        orderId: order._id,
        description: `Refund for order ${order._id}`,
      });

      await walletTransaction.save();

      await order.save();

      res.json({ message: "Order cancelled successfully" });
    } else {
      res.status(400).json({
        message: "Only pending orders can be cancelled",
      });
    }
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ message: "Error cancelling order" });
  }
};

const productCancel = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { orderId, productId } = req.params;
    const { reason } = req.body;
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    const item = order.items.id(productId);
    if (item) {
      item.status = "cancelled";
      item.cancelReason = reason;
      const productvariant = await productVarients.findById(item.variantId);
      productvariant.stock += item.quantity;
      await productvariant.save();
      if (order.items.every((i) => i.status === "cancelled")) {
        order.orderStatus = "cancelled";
        order.paymentStatus = "cancelled";
      }
    }
    if (
      order.paymentMethod === "wallet" ||
      order.paymentMethod === "razorpay"
    ) {
      await User.findByIdAndUpdate(userId, {
        $inc: { walletBalance: item.price },
      });
    }
    const walletTransaction = new Wallet({
      userId: userId,
      transactionId: `WL${Date.now()}`,
      type: "refund",
      amount: item.price,
      status: "success",
      orderId: order._id,
      description: `Refund for order ${order._id}`,
    });
    await walletTransaction.save();
    await order.save();
    res.json({ message: "Product cancelled successfully" });
  } catch (error) {
    console.error("Error cancelling product:", error);
    res.status(500).json({ message: "Error cancelling product" });
  }
};

const returnOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, comments } = req.body;
    const userId = req.session.user._id;

    const order = await Order.findOne({ _id: id, userId });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.orderStatus !== "delivered") {
      return res.status(400).json({
        message: "Only delivered orders can be returned",
      });
    }

    if (order.returnStatus !== "none") {
      return res.status(400).json({
        message: "Return already requested for this order",
      });
    }
    order.returnStatus = "pending";
    order.returnReason = reason;
    order.returnComments = comments;
    order.returnRequestedAt = new Date();
    order.orderStatus = "Return_Requested";

    order.items = order.items.map((item) => ({
      ...item,
      returnRequest: {
        status: "pending",
        reason: reason,
        comments: comments,
        requestedAt: new Date(),
      },
    }));

    await order.save();

    return res.status(200).json({
      message: "Return request submitted successfully",
      order,
    });
  } catch (error) {
    console.error("Return request error:", error);
    return res.status(500).json({
      message: "An error occurred while processing your return request",
    });
  }
};

const returnProduct = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { orderId, productId } = req.params;
    const { reason, comments } = req.body;
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.orderStatus !== "delivered" && order.orderStatus !== 'pending') {
      return res.status(400).json({
        message: "Only delivered orders can be returned",
      });
    }
    const product = order.items.find(
      (item) => item._id.toString() === productId
    );
    if (product && product.returnRequest && product.returnRequest.status !== "none") {
      return res.status(400).json({
        message: "Return request already submitted for this product",
      });
    }
    order.items = order.items.map((item) => {
      if (item._id.toString() === productId) {
        return {
          ...item,
          status: 'Return_Requested',
          returnRequest: {
            status: "pending",
            reason,
            comments,
            requestedAt: new Date(),
          },
        };
      }
      return item;
    });

    const isOnlyProduct = order.items.length == 1

    const allProductsReturn = order.items.every(item => item.status == 'Return_Requested')

    if(isOnlyProduct || allProductsReturn){
      order.orderStatus = 'Return_Requested'
    } else {
      order.orderStatus = 'pending'
    }

    order.returnStatus = "pending";
    order.returnReason = reason;
    order.returnComments = comments;
    order.returnRequestedAt = new Date();

    await order.save();

    return res.status(200).json({
      message: "Return request submitted successfully",
      order,
    });
  } catch (error) {
    console.error("Return product error:", error);
    return res.status(500).json({
    message: "An error occurred while processing your return request",
    });
  }
};

const generateInvoice = async (req,res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.user._id;

    const order = await Order.findOne({ _id: orderId, userId: userId })
        .populate('items.productId')
        .populate('shippingAddress');

    if (!order) {
        return res.status(404).json({ 
            success: false, 
            message: 'Order not found' 
        });
    }

    if (order.orderStatus !== 'delivered') {
        return res.status(400).json({
            success: false,
            message: 'Invoice can only be generated for delivered orders'
        });
    }

    const doc = new PDFDocument({
        size: 'A4',
        margin: 50
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${orderId.toString().slice(-6).toUpperCase()}.pdf`);

    doc.pipe(res);

    doc.fontSize(20)
       .text('FemmeVogue', 50, 50)
       .fontSize(10)
       .text('123 Business Street', 50, 80)
       .text('Thodupuzha, Kerala, 685585', 50, 95)
       .text('Phone: +91 8138078701', 50, 110)
       .text('Email: femmevoguee@gmail.com', 50, 125);

    doc.fontSize(20)
       .text('INVOICE', 250, 50);

    doc.fontSize(10)
       .text(`Invoice Number: INV-${order._id.toString().slice(-6).toUpperCase()}`, 400, 80)
       .text(`Order Date: ${formatDate(order.orderedAt)}`, 400, 95)
       .text(`Invoice Date: ${formatDate(new Date())}`, 400, 110);

    doc.fontSize(14)
       .text('Bill To:', 50, 170)
       .fontSize(10)
       .text(order.shippingAddress.name, 50, 190)
       .text(order.shippingAddress.addressLine, 50, 205)
       .text(`Phone: ${order.shippingAddress.phone}`, 50, 220);

    const tableTop = 280;
    doc.fontSize(10)
       .text('Item', 50, tableTop)
       .text('Quantity', 250, tableTop)
       .text('Price', 350, tableTop)
       .text('Total', 450, tableTop);

    doc.moveTo(50, tableTop + 15)
       .lineTo(550, tableTop + 15)
       .stroke();

    let position = tableTop + 30;
    order.items.forEach(item => {
        doc.text(item.productId.brandName, 50, position)
           .text(item.quantity.toString(), 250, position)
           .text(item.price, 350, position)
           .text((item.price * item.quantity), 450, position);
        
        position += 20;
    });

    doc.moveTo(50, position + 10)
       .lineTo(550, position + 10)
       .stroke();

    position += 30;
    doc.text('Subtotal:', 350, position)
       .text(order.subtotal, 450, position);
    
    position += 20;
    doc.text('Shipping:', 350, position)
       .text(order.shippingCharge, 450, position);
    
    position += 20;
    doc.fontSize(12)
       .text('Total:', 350, position)
       .text(order.finalTotal, 450, position);

    const pageWidth = doc.page.width;   
    const footerTop = doc.page.height - 80;

    const text = 'Thank you for your business!';
    const textWidth = doc.widthOfString(text); 
    const xPosition = (pageWidth - textWidth) / 2; 

    doc.fontSize(10)
       .text(text, xPosition, footerTop)
       .fontSize(8)
      //  .text('Terms & Conditions:', 50, footerTop + 20)
      //  .text('- All prices include GST where applicable', 50, footerTop + 35)
      //  .text('- Payment has been received in full', 50, footerTop + 50)
      //  .text('- Goods once sold cannot be returned', 50, footerTop + 65);

    doc.end();

} catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({
        success: false,
        message: 'Failed to generate invoice'
    });
}
};

const wishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;

    const user = await User.findById(userId).populate({
      path: "wishlist.product",
      select: "name brandName description image",
      populate: {
        path: "variants",
        select: "price",
      },
    });

    if (!user) {
      req.flash("error", "User not found");
      return res.redirect("/");
    }

    const wishlistItems = user.wishlist.map((item) => ({
      ...item.product.toObject(),
      addedAt: item.addedAt,
      productId: item.product._id,
    }));

    res.render("user/layout", {
      page: "wishlist",
      user,
      wishlistItems,
      isEmpty: wishlistItems.length === 0,
    });
  } catch (err) {
    console.error("Wishlist Error:", err);
    req.flash("error", "Failed to load wishlist");
    res.redirect("/");
  }
};

const removeWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const productId = req.params.id;

    const result = await User.updateOne(
      { _id: userId },
      { $pull: { wishlist: { product: productId } } }
    );

    if (result.modifiedCount > 0) {
      return res.json({
        success: true,
        message: "Product removed from wishlist",
      });
    } else {
      return res.status(404).json({
        success: false,
        message: "Product not found in wishlist",
      });
    }
  } catch (err) {
    console.error("Remove from Wishlist Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to remove product from wishlist",
    });
  }
};

const wallet = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const user = await User.findById(userId);
    const transactions = await Wallet.find({ userId }).sort({ date: -1 });
    res.render("user/layout", {
      page: "wallet",
      user,
      walletBalance: User.walletBalance || 0,
      transactions,
      razorpayKey: "rzp_test_30GZgvSGo32MQa",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const addPayment = async (req, res) => {
  try {
    const { amount } = req.body;
    const options = {
      amount,
      currency: "INR",
      receipt: `wallet_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);
    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create order" });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", "QyPY3GY7fyDrdpXS6E9nyJ95")
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature === expectedSign) {
      const payment = await razorpay.payments.fetch(razorpay_payment_id);

      const transaction = new Wallet({
        userId: req.user._id,
        transactionId: `WL${Date.now()}`,
        type: "credit",
        amount: payment.amount / 100,
        status: "success",
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        razorpaySignature: razorpay_signature,
      });
      await transaction.save();

      await User.findByIdAndUpdate(req.user._id, {
        $inc: { walletBalance: payment.amount / 100 },
      });

      res.json({ success: true });
    } else {
      res.status(400).json({ error: "Invalid signature" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Payment verification failed" });
  }
};

module.exports = {
  profile,
  profileUpdate,
  showPassword,
  changePassword,
  address,
  addressNew,
  addressEdit,
  addressDelete,
  orders,
  cancelOrder,
  productCancel,
  returnOrder,
  returnProduct,
  generateInvoice,
  wishlist,
  removeWishlist,
  wallet,
  addPayment,
  verifyPayment,
};

const User = require("../../models/user");
const Address = require("../../models/address");
const Order = require("../../models/order");
const bcrypt = require('bcrypt');
const productVarients = require("../../models/productVarients");

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
    if(user.googleId){
      if(currentPassword !== user.password){
        return res.status(400).json({
              success: false,
              message: "Current password is incorrect",
            });
      }
    }else {
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
    console.log("cfcf");
    const user = req.session.user;
    console.log(user);
    const addressId = req.params.id;
    console.log(addressId);

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
    const orders = await Order.find({ userId }).populate('items.productId').sort({ orderedAt: -1 });
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

        // Update the stock for the product variant
        const productVariant = await productVarients.findById(item.variantId);
        productVariant.stock += item.quantity;
        await productVariant.save();
      }
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

const productCancel = async(req,res) => {
  try{
    const {orderId,productId} = req.params
    const {reason} = req.body
    const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        const item = order.items.id(productId);
        if (item) {
            item.status = 'cancelled';
            item.cancelReason = reason;
            const productvariant = await productVarients.findById(item.variantId)
            productvariant.stock += item.quantity
            await productvariant.save()
             // Check if this was the only item in the order
         if (order.items.every(i => i.status === 'cancelled')) {
        // If all items are cancelled, set order and payment status to cancelled
        order.orderStatus = 'cancelled';
        order.paymentStatus = 'cancelled';
      }
            await order.save();
        }
        res.json({ message: 'Product cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling product:', error);
        res.status(500).json({ message: 'Error cancelling product' });
    }
};

const wishlist = async (req, res) => {
  try {
    const user = req.session.user;
    res.render("user/layout", { page: "wishlist", user });
  } catch (err) {
    console.error(err);
    res.status(400).send("something went wrong");
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
  wishlist,
};
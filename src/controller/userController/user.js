const User = require("../../models/user");
const Otp = require("../../models/otp");
const { validateSignUpData } = require("../../utils/validation");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const products = require("../../models/products");
const categories = require("../../models/categories");
const productVariant = require('../../models/productVarients')
const { calculateFinalPrice, getApplicableOffers } = require('../../utils/offer')

let transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "femmevoguee@gmail.com",
    pass: "lmytpxoehgvmdtws",
  },
});

const homePage = async (req, res) => {
  try {
    const user = req.session.user;
    res.render("user/index", { user });
  } catch (err) {
    console.error(err);
    res.status(400).send("something went wrong");
  }
};

const loadLogin = async (req, res) => {
  try {
    res.render("user/login", { message: "" });
  } catch (err) {
    console.error(err);
    res.status(400).send("something went wrong");
  }
};

const login = async (req, res) => {
  try {
    const { emailId, password } = req.body;
    const user = await User.findOne({
      emailId: emailId,
    });
    if (!user) {
      return res
        .status(400)
        .render("user/login", { message: "invalid credentials" });
    }
    if(user.isBlocked){
      return res
        .status(400)
        .render("user/login", { message: "user is blocked" });
    }
    if (!user.isVerified) {
      return res
        .status(400)
        .render("user/login", { message: "account is not verified" });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (isPasswordValid) {
      req.session.user = user;
      res.redirect("/");
    } else {
      return res
        .status(400)
        .render("user/login", { message: "invalid credentials" });
    }
  } catch (err) {
    console.error(err);
    res.status(400).send("something went wrong");
  }
};

const loadRegister = async (req, res) => {
  try {
    res.render("user/signup", { message: "" });
  } catch (err) {
    console.error(err);
    res.send(400).send("something went wrong");
  }
};

const register = async (req, res) => {
  try {
    validateSignUpData(req);
    const { firstName, lastName, emailId, password } = req.body;
    const existingUser = await User.findOne({
      emailId: emailId,
      isVerified: true,
    });
    if (existingUser) {
      res.send(400).render("user/register", { message: "user already exists" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      firstName,
      lastName,
      emailId,
      password: passwordHash,
      isVerified: false,
    });
    await user.save();
    await otp(user._id, user.emailId);
    req.session.emailId = user.emailId;
    req.session.userId = user._id;
    return res.redirect("/otp");
  } catch (err) {
    console.log(err.message);
    res.status(400).send("something went wrong");
  }
};

const loadOtp = async (req, res) => {
  try {
    res.render("user/otp", { message: "" });
  } catch (err) {
    console.error(err);
    res.status(400).send("something went wrong");
  }
};

const otp = async (_id, emailId) => {
  try {
    const otp = `${Math.floor(1000 + Math.random() * 9000)}`;
    const mailOptions = {
      from: "femmevoguee@gmail.com",
      to: emailId,
      subject: "verify your email",
      html: `<p> Enter ${otp} to verify your email address </p>`,
    };
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpirationMinutes = 1;
    const newOtp = await new Otp({
      userId: _id,
      otp: otpHash,
      expiresAt: new Date(Date.now() + otpExpirationMinutes * 60000),
    });
    await newOtp.save();
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error(err);
    return res.status(400).send("otp verfication failed");
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { otp1, otp2, otp3, otp4 } = req.body;
    const otp = `${otp1}${otp2}${otp3}${otp4}`;

    const userId = req.session.userId;

    const checkOtp = await Otp.findOne({ userId: userId });
    if (!checkOtp) {
      return res
        .status(400)
        .render("user/otp", { message: "no otp found for this user" });
    }
    const isMatch = await bcrypt.compare(otp, checkOtp.otp);
    if (!isMatch) {
      return res.status(400).render("user/otp", { message: "invalid otp" });
    }
    await User.findByIdAndUpdate(userId, { isVerified: true });
    await Otp.deleteOne({ userId: userId });
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("user not found after verification");
    }
    req.session.user = user;
    req.session.userId = undefined;
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(400).render("user/otp", { message: "something went wrong" });
  }
};

const resendOtp = async (req, res) => {
  try {
    const userId = req.session.userId;
    const emailId = req.session.emailId;
    if (!userId || !emailId) {
      return res.render("user/otp", {
        message: "session expired, please sign up again",
      });
    }
    const user = await User.findOne({ emailId: emailId });
    if (!user) {
      return res.render("user/otp", { message: "user not found" });
    }
    if (user.isVerified) {
      return res.render("user/otp", { message: "user is already verified" });
    }

    await Otp.deleteOne({ userId: userId });

    const otp = `${Math.floor(1000 + Math.random() * 9000)}`;
    const otpHash = await bcrypt.hash(otp, 10);
    await Otp.findOneAndUpdate(
      { userId: userId },
      { otp: otpHash },
      { upsert: true }
    );
    const mailOptions = {
      from: "femmevoguee@gmail.com",
      to: emailId,
      subject: "verify your email",
      html: `<p> Enter ${otp} to verify your email address </p>`,
    };
    await transporter.sendMail(mailOptions);
    return res.render("user/otp", { message: "Otp resended successfully" });
  } catch (err) {
    console.error(err);
    return res
      .status(400)
      .render("user/otp", { message: "Something went wrong" });
  }
};

const loadForgotPassword = async (req, res) => {
  try {
    res.render("user/forgot-password", { message: "" });
  } catch (err) {
    console.error(err);
    return res.status(400).send("something wrong");
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { emailId } = req.body;
    const user = await User.findOne({ emailId: emailId });
    if (!user) {
      return res
        .status(400)
        .render("user/forgot-password", { message: "user not found" });
    }
    const otp = `${Math.floor(1000 + Math.random() * 9000)}`;
    const otpHash = await bcrypt.hash(otp, 10);
    await Otp.findOneAndUpdate(
      { userId: user._id },
      { otp: otpHash },
      { upsert: true, new: true }
    );
    const mailOptions = {
      from: "femmevoguee@gmail.com",
      to: emailId,
      subject: "verify your email",
      html: `<p> Enter ${otp} to verify your email address </p>`,
    };
    await transporter.sendMail(mailOptions);
    req.session.userId = user._id;
    res.render("user/reset-otp", { message: "",emailId:emailId });
  } catch (err) {
    console.error(err);
    return res
      .status(400)
      .render("user/forgot-password", { message: "something wrong" });
  }
};

const resetOtpVerify = async (req, res) => {
  try {
    const { otp1, otp2, otp3, otp4 } = req.body;
    const otp = `${otp1}${otp2}${otp3}${otp4}`;

    const userId = req.session.userId;

    const checkOtp = await Otp.findOne({ userId: userId });
    if (!checkOtp) {
      return res
        .status(400)
        .render("user/otp", { message: "no otp found for this user" });
    }
    const isMatch = await bcrypt.compare(otp, checkOtp.otp);
    if (!isMatch) {
      return res.status(400).render("user/otp", { message: "invalid otp" });
    }
    res.render("user/reset-password");
  } catch (err) {
    console.error(err);
    return res
      .status(400)
      .render("user/reset-otp", { message: "something wrong" });
  }
};

const resetOtpResend = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(400).render("user/reset-otp", {
        message: "Session expired, please start the password reset process again",
      });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).render("user/reset-otp", { message: "User not found" });
    }
    const otp = `${Math.floor(1000 + Math.random() * 9000)}`;
    const otpHash = await bcrypt.hash(otp, 10);
    await Otp.findOneAndUpdate(
      { userId: userId },
      { otp: otpHash },
      { upsert: true, new: true }
    );
    const mailOptions = {
      from: "femmevoguee@gmail.com",
      to: user.emailId,
      subject: "Password Reset OTP",
      html: `<p>Enter ${otp} to reset your password</p>`,
    };
    await transporter.sendMail(mailOptions);
    return res.render("user/reset-otp", { message: "New OTP sent successfully" });
  } catch (err) {
    console.error(err);
    return res
      .status(400)
      .render("user/reset-otp", { message: "something wrong" });
  }
};

const loadResetPassword = async (req, res) => {
  try {
    res.render("user/reset-password",{ message: "" });
  } catch (err) {
    console.error(err);
    return res.status(400).send("something wrong");
  }
};

const resetPassword = async(req,res) => {
  try{
    const {newPassword} = req.body
    const userId = req.session.userId
    if(!userId) {
      return res.render("user/reset-password", {
        message: "session expired, please sign up again",
      });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(userId,{password: hashedPassword})
    await Otp.deleteOne({userId:userId})
    req.session.userId = undefined;
    res.render('user/login',{message:"Password successfully reset. Please log in."})
  } catch (err) {
    console.error(err);
    return res
      .status(400)
      .render("user/reset-password", { message: "something wrong" });
  }
}

const shop = async (req, res) => {
  try {
      const user = req.session.user;
      const category = await categories.find({isDeleted: false}).sort('name');
      const validCategoryIds = category.map(cat => cat._id);
      
      // Fetch products with populated category
      const baseProducts = await products
          .find({ 
              isDeleted: false,
              category: { $in: validCategoryIds}
          })
          .populate('category')
          .populate('variants');

      // Process products with offers
      const Products = await Promise.all(baseProducts.map(async (product) => {
          // Get the first variant since all prices are same
          const variant = product.variants[0];
          
          if (!variant) {
              return {
                  ...product.toObject(),
                  finalPrice: 0,
                  originalPrice: 0,
                  hasOffer: false
              };
          }

          // Calculate price with offers
          const priceInfo = await calculateFinalPrice(product, variant);

          return {
              ...product.toObject(),
              ...priceInfo
          };
      }));

      // Get minimum price across all products
      const minPrice = Math.min(
          ...Products.filter(p => p.finalPrice > 0)
                    .map(p => p.finalPrice)
      );

      res.render("user/shop", { 
          Products, 
          user, 
          category,
          minPrice 
      });
      
  } catch (err) {
      console.error(err);
      res.status(400).send("something went wrong");
  }
};

const addToWishlist = async (req, res) => {
  try {
      if (!req.session.user) {
          return res.status(401).json({
              success: false,
              message: 'Please log in first'
          });
      }

      const userId = req.session.user._id;
      const productId = req.params.id;
      const user = await User.findById(userId);
      
      if (!user) {
          return res.status(404).json({
              success: false,
              message: 'User not found'
          });
      }

      const wishlistItem = user.wishlist.find(
          item => item.product.toString() === productId
      );

      let added = false;

      if (wishlistItem) {
          user.wishlist = user.wishlist.filter(
              item => item.product.toString() !== productId
          );
      } else {
          user.wishlist.push({
              product: productId,
              addedAt: new Date()
          });
          added = true;
      }

      await user.save();

      res.json({
          success: true,
          added,
          message: added ? 'Added to wishlist' : 'Removed from wishlist'
      });

  } catch (error) {
      console.log(error)
      res.status(500).json({
          success: false,
          message: 'Failed to update wishlist'
      });
  }
};

const detail = async (req, res) => {
  try {
    const user = req.session.user;
    const productId = req.params.id;

    const product = await products.findById(productId)
      .populate("category")
      .populate({
        path: "variants",
        match: { isDeleted: false }
      });

    if (!product) {
      return res.status(404).send("Product not found");
    }

    // Extract unique sizes and colors from active variants
    const uniqueSizes = [...new Set(product.variants.map(variant => variant.size))];
    const uniqueColors = [...new Set(product.variants.map(variant => variant.color))];

    // Find related products
    const relatedProducts = await products.find({
      category: product.category,
      _id: { $ne: productId },
      isDeleted: false
    }).limit(4);

    // Get applicable offers for the product
    const offers = await getApplicableOffers(product, product.category);

    // Calculate prices with offers for each variant
    const variantsWithOffers = await Promise.all(product.variants.map(async (variant) => {
      const priceDetails = await calculateFinalPrice(product, variant);
      return {
        ...variant.toObject(),
        originalPrice: priceDetails.originalPrice,
        finalPrice: priceDetails.finalPrice,
        discountAmount: priceDetails.discountAmount,
        hasOffer: priceDetails.hasOffer
      };
    }));

    res.render("user/product-detail", {
      Products: product,
      uniqueSizes,
      uniqueColors,
      variants: variantsWithOffers,
      offers,
      user,
      relatedProducts,
      category: product.category.name
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong");
  }
};

const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        return res.status(400).send("something went wrong");
      }
      res.redirect("/");
    });
  } catch (err) {
    console.error(err);
    res.status(400).send("something went wrong");
  }
};

module.exports = {
  homePage,
  loadLogin,
  login,
  loadRegister,
  register,
  loadOtp,
  otp,
  verifyOtp,
  resendOtp,
  loadForgotPassword,
  forgotPassword,
  resetOtpVerify,
  resetOtpResend,
  loadResetPassword,
  resetPassword,
  shop,
  addToWishlist,
  detail,
  logout,
};

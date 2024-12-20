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

    const trendingProducts = await products.aggregate([
      {
        $lookup: {
          from: 'categories', 
          localField: 'category',
          foreignField: '_id',
          as: 'category'
        }
      },
      {
        $unwind: '$category'
      },
      {
        $match: {
          'category.name': { 
            $in: ['Salwars', 'Sarees', 'T-Shirt', 'Shirts', 'Jeans', 'tops'] 
          }
        }
      },
      {
        $lookup: {
          from: 'productvariants',
          localField: 'variants',
          foreignField: '_id',
          as: 'variants'
        }
      },
      {
        $limit: 8 
      }
    ]);
    
    // Optimize price calculation with bulk processing
    const processedProducts = await Promise.all(
      trendingProducts.map(async (product) => {
        const variant = product.variants[0]?.price;
        if (!variant) {
          return {
            ...product,
            finalPrice: 0,
            originalPrice: 0,
            hasOffer: false,
            discountAmount: 0
          };
        }

        // Single calculation method
        const priceInfo = await calculateFinalPrice(product, variant);
        return {
          ...product,
          ...priceInfo,
          image: product.image || [],
          category: {
            ...product.category,
            name: product.category?.name || 'Uncategorized'
          }
        };
      })
    );

    // Separate ethnic and western products after processing
    const trendingEthnic = processedProducts.filter(product => 
      ['Salwars', 'Sarees'].includes(product.category.name)
    ).slice(0, 4);

    const trendingWestern = processedProducts.filter(product => 
      ['T-Shirt', 'Shirts', 'Jeans', 'tops'].includes(product.category.name)
    ).slice(0, 4);

    res.render("user/index", { 
      user,
      trendingEthnic,
      trendingWestern 
    });
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
    const {
        search,
        category,
        brands,
        priceRange,
        sort = '',
        page = 1,
        limit = 12
    } = req.query;

    let query = { isDeleted: false };
    let sortOption = {};

    if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
            { brandName: searchRegex },
            { 'category.name': searchRegex }
        ];
    }

    if (category) {
      const categoryArray = category.split(',').map(cat => cat.trim());
  
      // Fetch ObjectIds from the categories collection
      const categoryIds = await categories
          .find({ name: { $in: categoryArray } })
          .select('_id')
          .lean();
  
      query.category = { $in: categoryIds.map(cat => cat._id) };
  }
  
    if (brands) {
        const brandArray = brands.split(',').map(brand => brand.trim());
        query.brandName = { $in: brandArray };
    }

    if (priceRange) {
      const ranges = priceRange.split(',');
      const priceQuery = await Promise.all(ranges.map(async (range) => {
          if (range === '5000+') {
              const variantIds = await productVariant.find({ price: { $gte: 5000 } }).select('_id');
              return { variants: { $in: variantIds } };
          }
          const [min, max] = range.split('-').map(Number);
          const variantIds = await productVariant.find({ 
              price: { 
                  $gte: min, 
                  $lte: max 
              }
          }).select('_id');
          return { variants: { $in: variantIds } };
      }));
  
      query = {
          ...query,
          $or: [...(query.$or || []), ...priceQuery]
      };
  }

    switch (sort) {
        case 'price-low':
            sortOption = { 'variants.price': 1 };
            break;
        case 'price-high':
            sortOption = { 'variants.price': -1 };
            break;
        case 'a-z':
            sortOption = { brandName: 1 };
            break;
        case 'z-a':
            sortOption = { brandName: -1 };
            break;
        case 'new':
            sortOption = { createdAt: -1 };
            break;
        case 'popularity':
            sortOption = { soldCount: -1 };
            break;
        default:
            sortOption = { createdAt: -1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [Products, totalCount] = await Promise.all([
        products.find(query)
            .populate({
                path: 'category',
                select: 'name'
            })
            .populate({
                path: 'variants',
                select: 'price stock'
            })
            .sort(sortOption)
            .skip(skip)
            .limit(parseInt(limit))
            .lean(), 
        products.countDocuments(query)
    ]);

    const processedProducts = await Promise.all(Products.map(async (product) => {
        const variant = product.variants[0]?.price;
        if (!variant) {
            return {
                ...product,
                finalPrice: 0,
                originalPrice: 0,
                hasOffer: false,
                discountAmount: 0
            };
        }

        const priceInfo = await calculateFinalPrice(product, variant);
        return {
            ...product,
            ...priceInfo,
            image: product.image || [], 
            category: {
                ...product.category,
                name: product.category?.name || 'Uncategorized'
            }
        };
    }));

    const Categories = await categories.aggregate([
        { $match: { isDeleted: false } },
        { $sort: { name: 1 } },
        {
            $lookup: {
                from: 'products',
                localField: '_id',
                foreignField: 'category',
                as: 'products'
            }
        },
        {
            $project: {
                name: 1,
                productCount: { $size: '$products' }
            }
        }
    ]);

    const paginationData = {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalProducts: totalCount,
        hasNextPage: skip + processedProducts.length < totalCount,
        hasPrevPage: page > 1
    };

    if (req.xhr) {
        return res.json({
            success: true,
            Products: processedProducts,
            pagination: paginationData,
            Categories
        });
    }

    return res.render("user/shop", {
        Products: processedProducts,
        Categories,
        user: req.session.user,
        currentPage: paginationData.currentPage,
        totalPages: paginationData.totalPages,
        query: req.query 
    });

} catch (error) {
    console.error('Shop Controller Error:', error);
    
    if (req.xhr) {
        return res.status(500).json({
            success: false,
            error: "An error occurred while fetching products"
        });
    }
    
    return res.status(500).render("error", {
        message: "An error occurred while loading the shop",
        error: process.env.NODE_ENV === 'development' ? error : {}
    });
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
      const productId = new mongoose.Types.ObjectId(req.params.id);

      // Check if the product is already in the user's wishlist
      const wishlistItem = await User.findOne(
          { _id: userId, 'wishlist.product': productId }
      );

      let updateResult;
      let added;

      if (wishlistItem) {
          // Remove from wishlist
          updateResult = await User.findByIdAndUpdate(
              userId,
              { $pull: { wishlist: { product: productId } } },
              { new: true }
          );
          added = false;
      } else {
          // Ensure atomic addition and avoid duplicates using $addToSet
          updateResult = await User.findByIdAndUpdate(
              userId,
              { 
                  $addToSet: { 
                      wishlist: { 
                          product: productId, 
                          addedAt: new Date() 
                      } 
                  } 
              },
              { new: true }
          );
          added = true;
      }

      if (!updateResult) {
          return res.status(404).json({
              success: false,
              message: 'User not found'
          });
      }

      res.json({
          success: true,
          added,
          message: added ? 'Added to wishlist' : 'Removed from wishlist'
      });

  } catch (error) {
      console.log(error);
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

const Category = require("../../models/categories");
const Product = require("../../models/products");
const Offer = require("../../models/offer");

const loadOffers = async (req, res) => {
  try {
    const offers = await Offer.find().sort({ createdAt: -1 });
    for (const offer of offers) {
      if (offer.type === "Product") {
        offer.applicableFor = await Product.findById(offer.applicableFor);
      } else if (offer.type === "Category") {
        offer.applicableFor = await Category.findById(offer.applicableFor);
      } else if (offer.type === "referral") {
      }
    }
    const products = await Product.find({ isDeleted: false });
    const categories = await Category.find({ isDeleted: false });

    res.render("admin/offers", {
      offers,
      products,
      categories,
      messages: {
        success: req.flash("success"),
        error: req.flash("error"),
      },
    });
  } catch (error) {
    console.error("Error fetching offers:", error);
    req.flash("error", "Failed to fetch offers");
    res.redirect("/admin/dashboard");
  }
};

const offerCreate = async (req, res) => {
    try {
        const {
            name,
            type,
            applicableFor,
            discountType,
            discountValue,
            startDate,
            endDate,
            minPurchaseAmount,
            maxDiscountAmount,
        } = req.body;

        if (!name || !type || !discountType || !discountValue) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields"
            });
        }

        if ((type === 'product' || type === 'category') && !applicableFor) {
            return res.status(400).json({
                success: false,
                message: `Please select a ${type} for this offer`
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (end <= start) {
            return res.status(400).json({
                success: false,
                message: "End date must be after start date"
            });
        }

        if (discountType === "percentage" && (discountValue <= 0 || discountValue > 100)) {
            return res.status(400).json({
                success: false,
                message: "Percentage discount must be between 0 and 100"
            });
        }

        const offer = new Offer({
            name,
            type,
            applicableFor,
            discountType,
            discountValue,
            startDate: start,
            endDate: end,
            minPurchaseAmount: minPurchaseAmount || 0,
            maxDiscountAmount: maxDiscountAmount || null,
        });

        await offer.save();
        
        return res.json({
            success: true,
            message: "Offer created successfully"
        });

    } catch (error) {
        console.error("Error creating offer:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to create offer"
        });
    }
};

const getOffer = async(req,res) => {
    try{
        const offerId = req.params.id;
        const offer = await Offer.findById(offerId)
        if (!offer) {
            return res.status(404).json({
                success: false,
                message: "Offer not found"
            });
        }
        return res.json({
            success: true,
            offer
        });
    } catch (error) {
        console.error("Error fetching offer:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch offer"
        });
    }
};

const offerEdit = async(req,res) => {
    try{
        const offerId = req.params.id
        const {
            name,
            type,
            applicableFor,
            discountType,
            discountValue,
            startDate,
            endDate,
            minPurchaseAmount,
            maxDiscountAmount
        } = req.body

        if (!name || !type || !discountType || !discountValue) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields"
            });
        }

        if ((type === 'product' || type === 'category') && !applicableFor) {
            return res.status(400).json({
                success: false,
                message: `Please select a ${type} for this offer`
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (end <= start) {
            return res.status(400).json({
                success: false,
                message: "End date must be after start date"
            });
        }

        if (discountType === "percentage" && (discountValue <= 0 || discountValue > 100)) {
            return res.status(400).json({
                success: false,
                message: "Percentage discount must be between 0 and 100"
            });
        }

        const updatedOffer = await Offer.findByIdAndUpdate(
            offerId, {
                name,
                type,
                applicableFor,
                discountType,
                discountValue,
                startDate: start,
                endDate: end,
                minPurchaseAmount: minPurchaseAmount || 0,
                maxDiscountAmount: maxDiscountAmount || null,
        },
    {
        new: true
    })
    if (!updatedOffer) {
        return res.status(404).json({
            success: false,
            message: "Offer not found"
        });
    }

    return res.json({
        success: true,
        message: "Offer updated successfully",
        offer: updatedOffer
    });

} catch (error) {
    console.error("Error updating offer:", error);
    return res.status(500).json({
        success: false,
        message: error.message || "Failed to update offer"
    });
}
};

const offerStatus = async(req,res) => {
    try{
        const offerId = req.params.id
        const {isActive} = req.body
        const offer = await Offer.findByIdAndUpdate(
            offerId,
                {isActive:isActive},
            {
                new: true
            }
        )
        if (!offer) {
            return res.status(404).json({
                success: false,
                message: 'Offer not found'
            });
        }
        res.json({
            success: true,
            message: 'Offer status updated successfully'
        });
    } catch (error) {
        console.error('Error updating offer status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update offer status'
        });
    }
};

const offerDelete = async(req,res) => {
    try{
        const offerId = req.params.id
        const offer = await Offer.findByIdAndDelete(offerId)
        if (!offer) {
            return res.status(404).json({
                success: false,
                message: 'Offer not found'
            });
        }
        res.json({
            success: true,
            message: 'Offer deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting offer:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete offer'
        });
    }
};

module.exports = {
  loadOffers,
  offerCreate,
  getOffer,
  offerEdit,
  offerStatus,
  offerDelete
};

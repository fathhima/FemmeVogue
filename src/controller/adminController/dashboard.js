const Order = require('../../models/order');
const moment = require('moment');

const calculateSummary = (orders) => {
    return orders.reduce((summary, order) => {
        summary.totalSales += order.subtotal || 0;
        summary.totalOrders += 1;
        summary.totalDiscount += order.couponDiscount || 0;
        summary.netRevenue += order.finalTotal || 0;
        return summary;
    }, {
        totalSales: 0,
        totalOrders: 0,
        totalDiscount: 0,
        netRevenue: 0
    });
};

const groupOrdersByDate = (orders, reportType) => {
    const groupedOrders = {};
    
    orders.forEach(order => {
        if (!order.orderedAt) {
            return;
        }

        let dateKey;
        const orderDate = moment(order.orderedAt);
        
        switch (reportType) {
            case 'daily':
                dateKey = orderDate.format('YYYY-MM-DD');
                break;
            case 'weekly':
                dateKey = `Week ${orderDate.isoWeek()} - ${orderDate.year()}`;
                break;
            case 'monthly':
                dateKey = orderDate.format('MMMM YYYY');
                break;
            case 'yearly':
                dateKey = orderDate.format('YYYY');
                break;
            default:
                dateKey = orderDate.format('YYYY-MM-DD');
        }

        if (!groupedOrders[dateKey]) {
            groupedOrders[dateKey] = {
                date: dateKey,
                orders: 0,
                grossSales: 0,
                discounts: 0,
                couponDeductions: 0,
                netSales: 0
            };
        }

        groupedOrders[dateKey].orders += 1;
        groupedOrders[dateKey].grossSales += order.subtotal || 0;
        
        const itemDiscounts = order.items?.reduce((total, item) => {
            if (!item || !item.price || !item.quantity) return total;
            const originalPrice = item.price * item.quantity;
            return total + (originalPrice - (item.price * item.quantity));
        }, 0) || 0;

        groupedOrders[dateKey].discounts += itemDiscounts;
        groupedOrders[dateKey].couponDeductions += order.couponDiscount || 0;
        groupedOrders[dateKey].netSales += order.finalTotal || 0;
    });

    return Object.values(groupedOrders);
};

const generateReport = async (req, res) => {
    
    try {
        const { reportType, startDate, endDate } = req.body;
        
        if (!reportType || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters'
            });
        }

        const parsedStartDate = moment(startDate).startOf('day');
        const parsedEndDate = moment(endDate).endOf('day');

        if (!parsedStartDate.isValid() || !parsedEndDate.isValid()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid date format'
            });
        }
        
        const baseQuery = {
            orderStatus: 'delivered',
            paymentStatus: 'completed',
            orderedAt: {
                $gte: parsedStartDate.toDate(),
                $lte: parsedEndDate.toDate()
            }
        };

        const orders = await Order.find(baseQuery)
            .populate('items.productId', 'name originalPrice')
            .populate('appliedCoupon', 'code discountAmount')
            .sort({ orderedAt: 1 })
            .lean();

        if (orders.length === 0) {
            return res.json({
                success: true,
                summary: {
                    totalSales: 0,
                    totalOrders: 0,
                    totalDiscount: 0,
                    netRevenue: 0
                },
                details: []
            });
        }

        const summary = calculateSummary(orders);

        const details = groupOrdersByDate(orders, reportType);

        res.json({
            success: true,
            summary,
            details
        });

    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating report',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const topPerformers = async(req,res) => {
    try {
        const { startDate, endDate } = req.body;        
        const parsedStartDate = moment(startDate).startOf('day');
        const parsedEndDate = moment(endDate).endOf('day');

        const baseQuery = {
            orderStatus: 'delivered',
            paymentStatus: 'completed',
            orderedAt: {
                $gte: parsedStartDate.toDate(),
                $lte: parsedEndDate.toDate()
            }
        };

        // Aggregate for top products
        const topProducts = await Order.aggregate([
            { $match: baseQuery },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            {$unwind: '$product'},
            {
                $group: {
                    _id: '$items.productId',
                    name: { $first: '$product.brandName' },
                    totalSales: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                    totalQuantity: { $sum: '$items.quantity' }
                }
            },
            { $sort: { totalSales: -1 } },
            { $limit: 10 }
        ]);

        // Aggregate for top categories
        const topCategories = await Order.aggregate([
            { $match: baseQuery },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $lookup: {
                    from: 'categories',
                    localField: 'product.category',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            {
                $group: {
                    _id: '$product.category',
                    name: { $first: '$category.name' },
                    totalSales: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                    totalQuantity: { $sum: '$items.quantity' }
                }
            },
            { $sort: { totalSales: -1 } },
            { $limit: 10 }
        ]);

        // Aggregate for top brands
        const topBrands = await Order.aggregate([
            { $match: baseQuery },
            { $unwind: '$items' },
            {
                $lookup: {
                    from: 'products',
                    localField: 'items.productId',
                    foreignField: '_id',
                    as: 'product'
                }
            },
            { $unwind: '$product' },
            {
                $group: {
                    _id: '$product.brandName',
                    name: { $first: '$product.brandName' },
                    totalSales: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                    totalQuantity: { $sum: '$items.quantity' }
                }
            },
            { $sort: { totalSales: -1 } },
            { $limit: 10 }
        ]);

        res.json({
            success: true,
            topProducts,
            topCategories,
            topBrands
        });

    } catch (error) {
        console.error('Error fetching top performers:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching top performers'
        });
    }
}

module.exports = {
    generateReport,
    topPerformers
};
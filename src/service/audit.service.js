const { getdb } = require("../config/db");
const logger = require("../config/logger");

const getAllActiveAuditLogs = async ({
    page = 1,
    limit = 10,
    startDate,
    endDate,
    status,
    dealType,
    orderByField = "created_at",
    orderDirection = "desc",
}) => {
    try {
        const skip = (page - 1) * limit;

        let where = { is_active: true };

        if (startDate && endDate) {
            where.created_at = {
                gte: new Date(startDate),
                lte: new Date(endDate),
            };
        }

        if (status) {
            where.deal = {
                status: { name: status },
            };
        }

        if (dealType) {
            where.deal = { ...(where.deal || {}), deal_type: dealType };
        }

        const logs = await getdb.auditLog.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        full_name: true,
                        email: true,
                        role: {
                            select: { id: true, name: true },
                        },
                    },
                },
                deal: {
                    select: {
                        id: true,
                        deal_number: true,
                        deal_type: true,
                        remarks: true,
                        rate: true,
                        amount: true,
                        status: { select: { id: true, name: true } },
                        customer: {
                            select: { id: true, name: true, customer_type: true },
                        },
                    },
                },
            },
            orderBy: { [orderByField]: orderDirection },
            skip,
            take: Number(limit),
        });

        const totalCount = await getdb.auditLog.count({ where });

        return {
            data: logs,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
            },
            sort: {
                field: orderByField,
                direction: orderDirection,
            },
        };
    } catch (error) {
        logger.error("Error fetching active audit logs:", error);
        throw error;
    }
};

const getAuditLogsByDealId = async (dealId) => {
    try {
        const logs = await getdb.auditLog.findMany({
            where: { deal_id: Number(dealId) },
            include: {
                user: { select: { id: true, full_name: true, email: true } },
            },
            orderBy: { created_at: "desc" },
        });

        if (!logs.length) {
            logger.info(`No audit logs found for deal ID ${dealId}`);
            return [];
        }

        return logs;
    } catch (error) {
        logger.error(`Error fetching audit logs for deal ID ${dealId}:`, error);
        throw error;
    }
};

module.exports = {
    getAllActiveAuditLogs,
    getAuditLogsByDealId
};

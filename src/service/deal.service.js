const path = require("path");
const fs = require("fs");
const { getdb } = require("../config/db");
const logger = require("../config/logger");
const ExcelJS = require("exceljs");
const PDFDocument = require ("pdfkit");
const generateDealSlipPDF = require("../utils/generatedealslip");
const uploadFileToLocal = require("../utils/upload");

const createDeal = async (data, userId) => {
  const {
    customer_id,
    deal_type,
    base_currency_id,
    quote_currency_id,
    branch_id,
    amount,
    rate,
    deal_date,
    settlement_date,
    remarks,
    status_id,
    system_bank_id,
    customer_bank_id,
    payment_mode,
    payment_status_name,
    notes,
  } = data;

  const timestamp = new Date();
  const currentYear = timestamp.getFullYear();

  const lastDeal = await getdb.deal.findFirst({
    where: { deal_number: { startsWith: `RFB-${currentYear}-` } },
    orderBy: { id: "desc" },
  });

  let nextCount = 1;
  if (lastDeal?.deal_number) {
    const parts = lastDeal.deal_number.split("-");
    const lastNumber = parseInt(parts[2], 10);
    nextCount = lastNumber + 1;
  }

  const formattedNumber = String(nextCount).padStart(4, "0");
  const deal_number = `RFB-${currentYear}-${formattedNumber}`;

  const systemBank = await getdb.systemBank.findUnique({
    where: { id: system_bank_id },
  });
  if (!systemBank) throw new Error("Selected System Bank not found");

  const customerBank = await getdb.customerBank.findUnique({
    where: { id: customer_bank_id },
  });
  if (!customerBank) throw new Error("Selected Customer Bank not found");

  const deal = await getdb.deal.create({
    data: {
      deal_number,
      customer_id,
      deal_type,
      base_currency_id,
      quote_currency_id,
      branch_id,
      amount,
      rate,
      deal_date,
      settlement_date,
      remarks,
      status_id,
      created_by: userId,
      created_at: timestamp,
      updated_at: timestamp,
    },
    include: {
      status: true,
      baseCurrency: true,
      quoteCurrency: true,
      customer: true,
      branch: true,
    },
  });

  const paymentStatus = await getdb.paymentStatus.findFirst({
    where: { name: payment_status_name || "Pending" },
  });
  if (!paymentStatus) {
    throw new Error(
      `Payment status '${payment_status_name || "Pending"}' not found.`
    );
  }

  const payment_reference = `PAY-${deal.deal_number}`;

  const payment = await getdb.payment.create({
    data: {
      deal_id: deal.id,
      payment_reference,
      payment_mode: payment_mode,
      amount: deal.amount,
      currency_id: deal.base_currency_id,
      payment_date: timestamp,
      system_bank_id,
      customer_bank_id,
      processed_by: userId,
      status_id: paymentStatus.id,
      notes: notes || "Initial payment auto-created from deal",
      created_at: timestamp,
      updated_at: timestamp,
    },
    include: {
      status: true,
      currency: true,
    },
  });

  await getdb.auditLog.create({
    data: {
      user_id: userId,
      action: "CREATE DEAL",
      entity_type: "Deal",
      entity_id: deal.id,
      deal_id: deal.id,
      old_value: null,
      is_active: true,
      new_value: JSON.stringify({
        deal_number: deal.deal_number,
        customer: deal.customer?.name,
        amount: deal.amount,
        deal_status: deal.status?.name,
        payment_status: paymentStatus.name,
        system_bank: systemBank.name,
      }),
      created_at: timestamp,
    },
  });

  logger.info(
    `✅ Deal ${deal.deal_number} & Payment ${payment.payment_reference} created successfully with '${paymentStatus.name}' status by user ${userId}`
  );

  return { deal, payment };
};

const getAllDeals = async ({
  page = 1,
  limit = 10,
  search = "",
  orderByField = "created_at",
  orderDirection = "desc",
  startDate,
  endDate,
  baseCurrencyCode,
  quoteCurrencyCode,
  statusName,
  dealType,
  userId,
  roleName,
  exportType,
  downloadreport,
}) => {
  const skip = (page - 1) * limit;

  const where = { AND: [] };

  if (search) {
    where.AND.push({
      OR: [
        { deal_number: { contains: search } },
        { customer: { name: { contains: search } } },
        { status: { name: { contains: search } } },
      ],
    });
  }

  if (startDate && endDate) {
    where.AND.push({
      created_at: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    });
  } else if (startDate) {
    where.AND.push({ created_at: { gte: new Date(startDate) } });
  } else if (endDate) {
    where.AND.push({ created_at: { lte: new Date(endDate) } });
  }

  if (baseCurrencyCode) {
    where.AND.push({
      baseCurrency: {
        code: { equals: baseCurrencyCode },
      },
    });
  }

  if (quoteCurrencyCode) {
    where.AND.push({
      quoteCurrency: {
        code: { equals: quoteCurrencyCode },
      },
    });
  }

  if (statusName) {
    where.AND.push({
      status: {
        name: { equals: statusName },
      },
    });
  }

  if (dealType) {
    where.AND.push({ deal_type: dealType });
  }

  if (roleName?.toLowerCase() === "maker") {
    where.AND.push({ created_by: userId });
  }

  if (where.AND.length === 0) delete where.AND;

  const pagination = downloadreport === "true"
    ? {} 
    : { skip, take: Number(limit) };

  const deals = await getdb.deal.findMany({
    where,
    include: {
      customer: {
        select: {
          id: true,
          name: true
        }
      },
      baseCurrency: {
        select: {
          id: true,
          code: true
        }
      },
      quoteCurrency: {
        select: {
          id: true,
          code: true
        }
      },
      status: {
        select: {
          id: true,
          name: true
        }
      },
      createdBy: {
        select:{
          id: true,
          full_name: true
        }
      },
      branch: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: { [orderByField]: orderDirection },
    ...pagination
  });

    if (downloadreport === "true" && (exportType === "excel" || exportType === "pdf")) {
      const exportsDir = path.join(process.cwd(), "exports");
      if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
      }

      if (exportType === "excel") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Deals Report");

        sheet.columns = [
          { header: "Deal Number", key: "deal_number", width: 20 },
          { header: "Customer", key: "customer", width: 25 },
          { header: "Base Currency", key: "baseCurrency", width: 15 },
          { header: "Quote Currency", key: "quoteCurrency", width: 15 },
          { header: "Status", key: "status", width: 15 },
          { header: "Deal Type", key: "deal_type", width: 15 },
          { header: "Created By", key: "createdBy", width: 20 },
          { header: "Created At", key: "created_at", width: 20 },
        ];

        deals.forEach((d) => {
          sheet.addRow({
            deal_number: d.deal_number,
            customer: d.customer?.name || "-",
            baseCurrency: d.baseCurrency?.code || "-",
            quoteCurrency: d.quoteCurrency?.code || "-",
            status: d.status?.name || "-",
            deal_type: d.deal_type || "-",
            createdBy: d.createdBy?.full_name || "-",
            created_at: new Date(d.created_at).toLocaleString(),
          });
        });

        const filePath = path.join(exportsDir, `deals_report_${Date.now()}.xlsx`);
        await workbook.xlsx.writeFile(filePath);
        return { filePath, type: "excel" };
      }

      if (exportType === "pdf") {
        const filePath = path.join(exportsDir, `deals_report_${Date.now()}.pdf`);
        const doc = new PDFDocument({ margin: 40 });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        doc.fontSize(18).text("Deals Report", { align: "center", underline: true });
        doc.moveDown(1.5);

        deals.forEach((d, i) => {
          doc
            .fontSize(12)
            .text(`${i + 1}. Customer name: ${d.customer?.name || "-"}`)
            .text(`   Deal number: ${d.deal_number || "-"}`)
            .text(`   Status of the deal: ${d.status?.name || "-"}`)
            .text(`   Transaction type: ${d.deal_type || "-"}`)
            .text(`   Base/Quote Currency: ${d.baseCurrency?.code || "-"}/${d.quoteCurrency?.code || "-"}`)
            .text(`   Created by: ${d.createdBy?.full_name || "-"}`)
            .text(`   Created at: ${new Date(d.created_at).toLocaleString()}`)
            .moveDown(1); 
        });

        doc.end();
        await new Promise((resolve) => stream.on("finish", resolve));
        return { filePath, type: "pdf" };
      }
    }

  const totalCount = await getdb.deal.count({ where });

  return {
    data: deals,
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
};

const getDealById = async (id, download_deal_slip = "false") => {
  const deal = await getdb.deal.findUnique({
    where: { id: Number(id) },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          customer_type: true,
          phone_number: true,
          address: true,
          city: true,
          state: true,
          country: true
        }
      },
      baseCurrency: {
        select: {
          id: true,
          name: true,
          code: true
        }
      },
      quoteCurrency: {
        select: {
          id: true,
          name: true,
          code: true
        }
      },
      status: {
        select: {
          id: true,
          name: true
        }
      },
      createdBy: {
        select: {
          id: true,
          full_name: true,
          email: true
        }
      },
      branch: {
        select: {
          id: true,
          name: true
        }
      },
      payments: {
        select: {
          deal_id: true,
          payment_reference: true,
          payment_mode: true,
          amount: true,
          payment_date: true,
          processed_by: true,
          notes: true,
          created_at: true,
          updated_at: true,
          status: {
            select: {
              id: true,
              name: true
            }
          },
          currency: {
            select: {
              id: true,
              name: true,
              code: true,
              is_active: true
            }
          },
          systemBank: {
            select: {
              id: true,
              name: true,
              swift_code: true,
              branch_name: true,
              account_number: true,
              contact_person: true,
              contact_number: true,
              address: true,
            }
          },
          customerBank: {
            select: {
              id: true,
              bank_name: true,
              swift_code: true,
              branch_name: true,
              account_number: true,
            }
          },
        },
      },
    },
  });

  if (!deal) throw new Error("Deal not found");

  if (download_deal_slip === "true") { 
    const filePath = await generateDealSlipPDF(deal); 
    return { filePath }; 
  }

  return deal;
};

const updateDealStatus = async (dealId, action, userId) => {
  const now = new Date();

  const normalizedAction = action.toLowerCase();
  let statusName;

  if (normalizedAction === "approve") statusName = "Approved";
  else if (normalizedAction === "reject") statusName = "Rejected";
  else throw new Error("Invalid action (expected 'approve' or 'reject')");

  const existingDeal = await getdb.deal.findUnique({
    where: { id: Number(dealId) },
    include: { status: true },
  });
  if (!existingDeal) throw new Error(`Deal with ID ${dealId} not found`);

  const statusRecord = await getdb.dealStatus.findFirst({
    where: { name: statusName },
  });
  if (!statusRecord) throw new Error(`Deal status '${statusName}' not found`);

  const updatedDeal = await getdb.deal.update({
    where: { id: Number(dealId) },
    data: {
      status_id: statusRecord.id,
      approved_by: userId,
      approved_at: now,
      updated_at: now,
    },
    include: { status: true },
  });

  await getdb.auditLog.updateMany({
    where: { deal_id: Number(dealId), is_active: true },
    data: { is_active: false },
  });

  const actionText = normalizedAction === "approve" ? "Approved Deal" : "Rejected Deal";

  await getdb.auditLog.create({
    data: {
      user_id: userId,
      action: actionText,
      entity_type: "Deal",
      entity_id: Number(dealId),
      deal_id: Number(dealId),
      is_active: true,
      new_value: JSON.stringify({
        deal_number: updatedDeal.deal_number,
        new_status: statusName,
        approved_by: userId,
      }),
      created_at: now,
    },
  });

  logger.info(
    `✅ Deal ${updatedDeal.deal_number} marked as ${statusName} by user ${userId}`
  );

  return updatedDeal;
};

const uploadDealDocument = async (dealId, file, userId) => {
  try {
    if (!file) {
      throw new Error("File is required");
    }

    const timestamp = new Date();

    const filePath = await uploadFileToLocal(file, "efd");

    const doc = await getdb.dealDocument.create({
      data: {
        deal_id: Number(dealId),
        file_name: file.originalname,
        file_path: filePath,
        mime_type: file.mimetype,
        uploaded_by: userId,
        uploaded_at: timestamp,
      },
    });

    return doc;
  } catch (error) {
    console.error("❌ Error uploading deal document:", error);
    throw error;
  }
};

module.exports = {
  createDeal,
  getAllDeals,
  getDealById,
  updateDealStatus,
  uploadDealDocument,
};
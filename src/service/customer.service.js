const { getdb } = require("../config/db");
const logger = require("../config/logger");
const uploadFileToLocal = require("../utils/upload");
const sns = require("../config/sns");

const createCustomer = async (data, files = [], userId) => {
  try {
    const { banks = [], ...customerData } = data;
    const uploadedDocs = [];
    const timestamp = new Date();

    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const docType =
          data[`kyc_documents[${i}][document_type]`] || "id_proof";

        const filePath = await uploadFileToLocal(file, "kyc");

        uploadedDocs.push({
          document_type: docType,
          file_name: file.originalname,
          file_path: filePath,
          mime_type: file.mimetype,
          uploaded_by: userId,
          uploaded_at: timestamp,
        });
      }
    }

    const customerBanks = Array.isArray(banks)
      ? banks.map((bank) => ({
          bank_name: bank.bank_name,
          branch_name: bank.branch_name,
          account_number: bank.account_number,
          swift_code: bank.swift_code,
          country: bank.country,
          currency_id: Number(bank.currency_id),
          is_primary: bank.is_primary === "true" || bank.is_primary === true,
          is_active:
            bank.is_active === "false" || bank.is_active === false
              ? false
              : true,
          is_dormant:
            bank.is_dormant === "true" || bank.is_dormant === true
              ? true
              : false,
          created_by: userId,
          created_at: timestamp,
          updated_at: timestamp,
        }))
      : [];

    const newCustomer = await getdb.customer.create({
      data: {
        customer_type: customerData.customer_type,
        name: customerData.name,
        email: customerData.email,
        phone_number: customerData.phone_number,
        address: customerData.address,
        city: customerData.city,
        state: customerData.state,
        postal_code: customerData.postal_code,
        country: customerData.country,
        risk_level: customerData.risk_level,
        remarks: customerData.remarks,
        created_by: userId,
        created_at: timestamp,
        updated_at: timestamp,
        kycDocuments:
          uploadedDocs.length > 0 ? { create: uploadedDocs } : undefined,
        banks: customerBanks.length > 0 ? { create: customerBanks } : undefined,
      },
      include: {
        kycDocuments: true,
        banks: true,
      },
    });

    logger.info(`✅ Customer created successfully: ${newCustomer.id}`);
    return newCustomer;
  } catch (error) {
    logger.error("❌ Error creating customer:", error);
    throw error;
  }
};

// const otpStore = {}; 
// const OTP_EXPIRY_MS = 5 * 60 * 1000;

// const sendOtpForCustomer = async (data, files = [], userId) => {
//   const phone = data.contact_number;

//   if (!phone) throw new Error("Phone number is required to send OTP");

//   // Generate OTP (6 digits)
//   const otp = Math.floor(100000 + Math.random() * 900000);

//   // Store temporary (before inserting to DB)
//   otpStore[phone] = {
//     otp,
//     expiresAt: Date.now() + OTP_EXPIRY_MS,
//     customerData: data,
//     files,
//     userId,
//   };

//   // Send OTP using AWS SNS
//   await sns.publish({
//     Message: `Your verification code is: ${otp}`,
//     PhoneNumber: phone.startsWith("+") ? phone : `+${phone}`,
//   }).promise();

//   logger.info(`📩 OTP sent to customer phone: ${phone}`);

//   return { message: "OTP sent successfully" };
// };

// const createCustomer = async (contact_number, enteredOtp) => {
//   const record = otpStore[contact_number];
//   if (!record) throw new Error("OTP expired or not found");

//   if (Date.now() > record.expiresAt) {
//     delete otpStore[contact_number];
//     throw new Error("OTP has expired. Please request again.");
//   }

//   if (String(record.otp) !== String(enteredOtp)) {
//     throw new Error("Invalid OTP");
//   }

//   // OTP MATCHED — NOW INSERT CUSTOMER
//   const { customerData, files, userId } = record;
//   delete otpStore[contact_number];

//   const {
//     banks = [],
//     ...customerPayload
//   } = customerData;

//   const timestamp = new Date();
//   const uploadedDocs = [];

//   // Upload all KYC files
//   if (files && files.length > 0) {
//     for (let i = 0; i < files.length; i++) {
//       const file = files[i];
//       const docType = customerData[`kyc_documents[${i}][document_type]`] || "id_proof";

//       const filePath = await uploadFileToLocal(file);

//       uploadedDocs.push({
//         document_type: docType,
//         file_name: file.originalname,
//         file_path: filePath,
//         mime_type: file.mimetype,
//         uploaded_by: userId,
//         uploaded_at: timestamp,
//       });
//     }
//   }

//   // Prepare customer bank data
//   const customerBanks = Array.isArray(banks)
//     ? banks.map((bank) => ({
//         bank_name: bank.bank_name,
//         branch_name: bank.branch_name,
//         account_number: bank.account_number,
//         swift_code: bank.swift_code,
//         country: bank.country,
//         currency_id: Number(bank.currency_id),
//         is_primary: bank.is_primary === "true" || bank.is_primary === true,
//         is_active: bank.is_active !== "false",
//         is_dormant: bank.is_dormant === "true" || bank.is_dormant === true,
//         created_by: userId,
//         created_at: timestamp,
//         updated_at: timestamp,
//       }))
//     : [];

//   // INSERT NOW
//   const newCustomer = await getdb.customer.create({
//     data: {
//       customer_type: customerPayload.customer_type,
//       name: customerPayload.name,
//       email: customerPayload.email,
//       phone_number: customerPayload.phone_number,
//       address: customerPayload.address,
//       city: customerPayload.city,
//       state: customerPayload.state,
//       postal_code: customerPayload.postal_code,
//       country: customerPayload.country,
//       risk_level: customerPayload.risk_level,
//       remarks: customerPayload.remarks,
//       created_by: userId,
//       created_at: timestamp,
//       updated_at: timestamp,

//       kycDocuments:
//         uploadedDocs.length > 0 ? { create: uploadedDocs } : undefined,

//       banks:
//         customerBanks.length > 0 ? { create: customerBanks } : undefined,
//     },
//     include: {
//       kycDocuments: true,
//       banks: true,
//     },
//   });

//   logger.info(`✅ Customer created successfully after OTP: ${newCustomer.id}`);

//   return newCustomer;
// };

const listCustomers = async (page = 1, limit = 10, search = "", status, userId, roleName) => {
  try {
    page = parseInt(page);
    limit = parseInt(limit);
    const skip = (page - 1) * limit;

    const where = { AND: [] };

    if (search) {
      where.AND.push({
        OR: [
          { name: { contains: search } },
          { email: { contains: search } },
          { phone_number: { contains: search } },
          { city: { contains: search } },
          { country: { contains: search } },
        ],
      });
    }

    if (roleName?.toLowerCase() === "maker") {
      where.AND.push({ created_by: userId });
    }

    if (where.AND.length === 0) delete where.AND;

    const customers = await getdb.customer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
      include: {
        kycDocuments: {
          select: { id: true, document_type: true, verified: true },
        },
        banks: {
          select: {
            id: true,
            bank_name: true,
            account_number: true,
            is_primary: true,
            is_active: true,
          },
        },
        deals: {
          where: {
            deleted_at: null,
            ...(status
              ? { status: { name: { equals: status } } }
              : {}),
          },
          select: {
            id: true,
            deal_number: true,
            deal_type: true,
            amount: true,
            rate: true,
            status: { select: { id: true, name: true } },
          },
        },
      },
    });

    const total = await getdb.customer.count({ where });

    return {
      data: customers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error("❌ Error in listCustomers:", error);
    throw error;
  }
};

const getCustomerById = async (id) => {
  const customerId = Number(id);

  const customer = await getdb.customer.findUnique({
    where: { id: customerId },
    include: {
      createdBy: { 
        select: { 
          id: true, 
          full_name: true, 
          email: true,
          role:{
            select:{
              name: true
            }
          } 
        } 
      },
      
      kycDocuments: {
        include: {
          uploadedBy: { 
            select: { 
              id: true, 
              full_name: true, 
              email: true 
            } 
          },
          verifiedBy: { 
            select: { 
              id: true, 
              full_name: true, 
              email: true 
            } 
          },
        },
      },
      kycVerifiedBy: { 
        select: { 
          id: true, 
          full_name: true, 
          email: true 
        } 
      },
      banks: {
        where: { 
          deleted_at: null 
        },
        include:{
          currency:{
              select:{
                code: true,
                country: true,
                name: true,
              }
            }
        }
      },
      deals: {
        where: { 
          deleted_at: null 
        },
        include: {
          createdBy: { 
            select: { 
              id: true, 
              full_name: true, 
              email: true 
            } 
          },
          status: { 
            select: { 
              id: true, 
              name: true 
            } 
          },
          baseCurrency:{
            select:{
              id: true,
              name: true,
              code: true
            }
          },
          quoteCurrency:{
            select:{
              id: true,
              name: true,
              code: true
            }
          }
        },
      },
    },
  });

  if (!customer) throw new Error("Customer not found");

  const totalDeals = customer.deals.length;

  const dealStatusCounts = customer.deals.reduce((acc, deal) => {
    const statusName = deal.status?.name || "Unknown";
    acc[statusName] = (acc[statusName] || 0) + 1;
    return acc;
  }, {});

  return {
    ...customer,
    totalDeals,
    dealStatusCounts,
  };
};

const updateCustomer = async (id, data, userId) => {
  const existing = await getdb.customer.findUnique({
    where: { id: Number(id) },
    include: { banks: true },
  });

  if (!existing) throw new Error("Customer not found");

  const { banks, ...customerData } = data;

  const updatedCustomer = await getdb.customer.update({
    where: { id: Number(id) },
    data: {
      ...customerData,
      updated_at: new Date(),
    },
  });

  if (Array.isArray(banks)) {
    const existingBanks = existing.banks;
    const existingIds = existingBanks.map((b) => b.id);
    const inputIds = banks.filter((b) => b.id).map((b) => b.id);

    const banksToDelete = existingIds.filter((bankId) => !inputIds.includes(bankId));
    if (banksToDelete.length > 0) {
      await getdb.customerBank.updateMany({
        where: { id: { in: banksToDelete } },
        data: {
          is_active: false,
          deleted_at: new Date(),
          deleted_by: userId,
        },
      });
    }

    for (const bank of banks.filter((b) => b.id)) {
      await getdb.customerBank.update({
        where: { id: bank.id },
        data: {
          bank_name: bank.bank_name,
          branch_name: bank.branch_name,
          account_number: bank.account_number,
          swift_code: bank.swift_code,
          country: bank.country,
          currency_id: bank.currency_id,
          is_primary: bank.is_primary ?? false,
          updated_at: new Date(),
        },
      });
    }

    const newBanks = banks.filter((b) => !b.id);
    for (const bank of newBanks) {
      await getdb.customerBank.create({
        data: {
          customer_id: parseInt(id),
          bank_name: bank.bank_name,
          branch_name: bank.branch_name,
          account_number: bank.account_number,
          swift_code: bank.swift_code,
          country: bank.country,
          currency_id: bank.currency_id,
          is_primary: bank.is_primary ?? false,
          is_active: true,
          is_dormant: false,
          created_by: userId, 
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    }
  }

  return updatedCustomer;
};

const verifyCustomer = async (id, verifiedBy, status, reason = null) => {
  const customerId = Number(id);

  const existing = await getdb.customer.findUnique({
    where: { id: customerId },
  });
  if (!existing) throw new Error("Customer not found");

  let updateData = {
    verified: status,
    kyc_verified_by: verifiedBy,
    kyc_verified_at: new Date(),
    updated_at: new Date(),
  };

  if (status === false) {
    updateData.remarks = reason || "Customer verification rejected";
  }

  const updated = await getdb.customer.update({
    where: { id: customerId },
    data: updateData,
  });

  logger.info(
    `Customer ${id} verification status changed to ${status ? "Verified" : "Rejected"} by user ${verifiedBy}`
  );

  return updated;
};

const uploadKycDocument = async (data, file, userId) => {
  const { customer_id, document_type, uploaded_by } = data;

  const customer = await getdb.customer.findUnique({ where: { id: Number(customer_id) } });
  if (!customer) throw new Error("No customer found with this ID");

  if (!file) throw new Error("No file uploaded");

  const filePath = await uploadFileToLocal(file, "kyc"); 

  const document = await getdb.kycDocument.create({
    data: {
      customer_id: Number(customer_id),
      document_type,
      file_name: file.originalname,
      file_path: filePath,
      mime_type: file.mimetype,
      uploaded_by: userId,
      uploaded_at: new Date(),
    },
  });

  logger.info(`KYC doc uploaded for customer ${customer_id}`);
  return document;
};


module.exports = {
  createCustomer,
  // sendOtpForCustomer,
  listCustomers,
  getCustomerById,
  updateCustomer,
  verifyCustomer,
  uploadKycDocument,
};

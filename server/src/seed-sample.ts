import "dotenv/config";
import { randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import { initializeDatabase, pool } from "./db";

const medicineCatalog = [
  ["Paracetamol 500 mg tablets", "Paracetamol", false, 120],
  ["Ibuprofen 200 mg tablets", "Ibuprofen", false, 180],
  ["Cetirizine 10 mg tablets", "Cetirizine", false, 150],
  ["Oral rehydration salts sachets", "Oral rehydration salts", false, 80],
  ["Zinc 20 mg tablets", "Zinc sulfate", false, 110],
  ["Antacid chewable tablets", "Calcium carbonate", false, 130],
  ["Vitamin C 500 mg tablets", "Ascorbic acid", false, 200],
  ["Multivitamin tablets", "Multivitamins", false, 350],
  ["Loratadine 10 mg tablets", "Loratadine", false, 160],
  ["Topical antiseptic solution", "Chlorhexidine", false, 240],
  ["Amoxicillin 500 mg capsules", "Amoxicillin", true, 480],
  ["Azithromycin 500 mg tablets", "Azithromycin", true, 650],
  ["Metformin 500 mg tablets", "Metformin", true, 220],
  ["Amlodipine 5 mg tablets", "Amlodipine", true, 250],
  ["Losartan 50 mg tablets", "Losartan", true, 390],
  ["Atorvastatin 20 mg tablets", "Atorvastatin", true, 500],
  ["Omeprazole 20 mg capsules", "Omeprazole", true, 270],
  ["Salbutamol inhaler", "Salbutamol", true, 750],
  ["Hydrocortisone 1% cream", "Hydrocortisone", true, 280],
  ["Fluconazole 150 mg capsules", "Fluconazole", true, 300],
  ["Doxycycline 100 mg capsules", "Doxycycline", true, 420],
  ["Ciprofloxacin 500 mg tablets", "Ciprofloxacin", true, 470],
  ["Loperamide 2 mg capsules", "Loperamide", false, 190],
  ["Iron and folic acid tablets", "Ferrous sulfate and folic acid", false, 160],
  ["Folic acid 5 mg tablets", "Folic acid", false, 100],
  ["Calcium and vitamin D tablets", "Calcium and vitamin D", false, 340],
  ["Eye lubricant drops", "Carboxymethylcellulose", false, 390],
  ["Clotrimazole 1% cream", "Clotrimazole", false, 210],
  ["Miconazole 2% cream", "Miconazole", false, 250],
  ["Diclofenac 50 mg tablets", "Diclofenac", true, 230],
  ["Prednisolone 5 mg tablets", "Prednisolone", true, 260],
  ["Cotrimoxazole 480 mg tablets", "Sulfamethoxazole and trimethoprim", true, 190],
  ["Propranolol 40 mg tablets", "Propranolol", true, 180],
  ["Hydrochlorothiazide 25 mg tablets", "Hydrochlorothiazide", true, 150],
  ["Furosemide 40 mg tablets", "Furosemide", true, 180],
  ["Glibenclamide 5 mg tablets", "Glibenclamide", true, 130],
  ["Fluoxetine 20 mg capsules", "Fluoxetine", true, 350],
  ["Lansoprazole 30 mg capsules", "Lansoprazole", true, 300],
  ["Eye antibiotic drops", "Chloramphenicol", true, 270],
  ["Oral iron tablets", "Ferrous fumarate", false, 180],
  ["Nasal saline spray", "Sodium chloride", false, 330],
  ["Antifungal powder", "Clotrimazole", false, 260],
  ["Skin emollient cream", "Emollient blend", false, 420],
  ["Gauze dressing pack", "Medical dressing", false, 140],
  ["Adhesive bandage pack", "Medical dressing", false, 90],
  ["Digital thermometer", "Medical device", false, 550],
];

const sampleUsers = [
  "sample.cashier@payassure.local",
  "sample.pharmacist@payassure.local",
  "sample.manager@payassure.local",
];
const supplierNames = [
  "Central Medical Wholesalers",
  "Green Cross Distributors",
  "City Health Supply",
  "Community Pharmacy Supply",
  "Coastline Medical Trading",
  "Highland Health Distributors",
  "Metro Pharma Wholesale",
  "Unity Medical Suppliers",
  "Prime Care Distributors",
  "Eastgate Pharma Supply",
  "Lakeside Medical Wholesale",
  "Trusted Health Products",
];

type Medicine = {
  id: number;
  name: string;
  priceCents: number;
  prescriptionRequired: boolean;
  batches: Array<{ id: number; code: string; expiry: string; stock: number }>;
};

function expiryDate(daysFromToday: number): string {
  return new Date(Date.now() + daysFromToday * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function generatedPassword(): string {
  return randomBytes(18).toString("base64url");
}

async function seedDashboardSampleData(client: PoolClient): Promise<void> {
  const existingDashboardSamples = await client.query(
    "SELECT 1 FROM sales WHERE payer_name LIKE 'Demo Dashboard Payer %' LIMIT 1",
  );
  if (existingDashboardSamples.rowCount) {
    throw new Error("Dashboard sample transactions already exist; no data was changed.");
  }
  const existingTodaySales = await client.query(
    `SELECT 1 FROM sales WHERE created_at >= CURRENT_DATE
     AND created_at < CURRENT_DATE + INTERVAL '1 day' LIMIT 1`,
  );
  if (existingTodaySales.rowCount) {
    throw new Error("Today's sales already exist; refusing to mix sample data with them.");
  }

  const users = await client.query(
    "SELECT email FROM users WHERE email = ANY($1::text[]) ORDER BY email",
    [sampleUsers],
  );
  if (users.rowCount !== sampleUsers.length) {
    throw new Error("Create the sample users before seeding dashboard transactions.");
  }

  await client.query(
    `UPDATE products p
     SET buying_price_cents = (p.price_cents * 3 / 5)::integer
     FROM suppliers s
     WHERE p.supplier_id = s.id
       AND s.payassure_merchant_id LIKE 'DEMO-PA-TEST-MERCHANT-%'
       AND p.buying_price_cents IS NULL`,
  );
  const products = await client.query(
    `SELECT p.id, p.name, p.price_cents, p.prescription_required
     FROM products p
     JOIN suppliers s ON s.id = p.supplier_id
     WHERE s.payassure_merchant_id LIKE 'DEMO-PA-TEST-MERCHANT-%'
     ORDER BY p.id
     LIMIT 12`,
  );
  if (products.rowCount !== 12) {
    throw new Error("Expected the complete sample product catalog before dashboard seeding.");
  }

  for (let index = 0; index < products.rows.length; index += 1) {
    const product = products.rows[index] as {
      id: number;
      name: string;
      price_cents: number;
      prescription_required: boolean;
    };
    const quantity = (index % 3) + 1;
    const lockedProduct = await client.query(
      "SELECT id FROM products WHERE id = $1 FOR UPDATE",
      [product.id],
    );
    if (!lockedProduct.rowCount) {
      throw new Error(`Sample product ${product.name} is no longer available.`);
    }

    let remaining = quantity;
    const batches = await client.query(
      `SELECT id, batch_code, expiry_date, stock_count
       FROM product_batches
       WHERE product_id = $1 AND stock_count > 0 AND expiry_date >= CURRENT_DATE
       ORDER BY expiry_date, id FOR UPDATE`,
      [product.id],
    );
    const allocations: Array<{
      id: number;
      batch_code: string;
      expiry_date: string;
      quantity: number;
    }> = [];
    for (const batch of batches.rows) {
      if (!remaining) break;
      const allocated = Math.min(remaining, Number(batch.stock_count));
      if (allocated > 0) {
        allocations.push({
          id: Number(batch.id),
          batch_code: batch.batch_code,
          expiry_date: batch.expiry_date,
          quantity: allocated,
        });
        remaining -= allocated;
      }
    }
    if (remaining > 0) {
      throw new Error(`Not enough unexpired stock for sample product ${product.name}.`);
    }

    const paymentMethod = index >= 8 ? "credit" : "cash";
    const payerName = paymentMethod === "credit" ? `Demo Dashboard Payer ${index - 7}` : null;
    const payerPhone = paymentMethod === "credit" ? `000000000${index - 7}` : null;
    const prescriptionReference = product.prescription_required
      ? `DEMO-DASHBOARD-RX-${String(index + 1).padStart(2, "0")}`
      : null;
    const sale = await client.query(
      `INSERT INTO sales
         (payment_method, status, total_cents, payer_name, payer_phone,
          prescription_reference, prescription_checked_by, created_at)
       VALUES ($1, 'completed', $2, $3, $4, $5, $6,
               NOW() - ($7 * INTERVAL '2 minutes'))
       RETURNING id`,
      [
        paymentMethod,
        Number(product.price_cents) * quantity,
        payerName,
        payerPhone,
        prescriptionReference,
        prescriptionReference ? users.rows[index % users.rowCount].email : null,
        products.rows.length - index,
      ],
    );
    const saleId = Number(sale.rows[0].id);
    for (const allocation of allocations) {
      await client.query(
        "UPDATE product_batches SET stock_count = stock_count - $2 WHERE id = $1",
        [allocation.id, allocation.quantity],
      );
      await client.query(
        `INSERT INTO sale_items
           (sale_id, product_id, product_name, quantity, unit_price_cents,
            batch_id, batch_code, batch_expiry_date, buying_unit_price_cents,
            supplier_id, supplier_name)
         SELECT $1, p.id, p.name, $3, p.price_cents, b.id, b.batch_code,
                b.expiry_date, p.buying_price_cents, s.id, s.name
         FROM products p
         JOIN product_batches b ON b.id = $2
         JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.id = $4`,
        [saleId, allocation.id, allocation.quantity, product.id],
      );
    }
    await client.query(
      "UPDATE products SET stock_count = stock_count - $2 WHERE id = $1",
      [product.id, quantity],
    );
  }

  for (const [index, failureReason] of [
    "Insufficient unexpired stock for requested item",
    "Checkout cancelled before payment",
    "Product quantity exceeded available stock",
  ].entries()) {
    await client.query(
      `INSERT INTO failed_checkout_attempts
         (payment_method, total_cents, failure_reason, created_by, created_at)
       VALUES ('cash', $1, $2, $3, NOW() - ($4 * INTERVAL '18 minutes'))`,
      [
        12500 + index * 4800,
        failureReason,
        users.rows[index % users.rowCount].email,
        index,
      ],
    );
  }
}

async function seedSampleData(): Promise<void> {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.POS_ALLOW_SAMPLE_DATA !== "true"
  ) {
    throw new Error(
      "Sample seeding is development-only. Set NODE_ENV=development and POS_ALLOW_SAMPLE_DATA=true.",
    );
  }
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
    throw new Error("Sample seeding only runs against a localhost PostgreSQL database.");
  }

  await initializeDatabase();
  const client: PoolClient = await pool.connect();
  const newCredentials: Array<{ email: string; password: string }> = [];
  try {
    await client.query("BEGIN");
    const existingData = await client.query(
      "SELECT 1 FROM suppliers WHERE name = $1 LIMIT 1",
      [supplierNames[0]],
    );
    if (existingData.rowCount) {
      await seedDashboardSampleData(client);
      await client.query("COMMIT");
      console.log(
        "Added 12 sample sales (4 on credit) and 3 failed checkout attempts for the dashboard.",
      );
      return;
    }

    const userRows: Array<{ id: number; email: string }> = [];
    for (const email of sampleUsers) {
      const existingUser = await client.query(
        "SELECT id, email FROM users WHERE email = $1",
        [email],
      );
      if (existingUser.rowCount) {
        userRows.push({
          id: Number(existingUser.rows[0].id),
          email: existingUser.rows[0].email,
        });
        continue;
      }
      const password = generatedPassword();
      const passwordHash = await bcrypt.hash(password, 12);
      const inserted = await client.query(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2)
         RETURNING id, email`,
        [email, passwordHash],
      );
      userRows.push({
        id: Number(inserted.rows[0].id),
        email: inserted.rows[0].email,
      });
      newCredentials.push({ email, password });
    }

    const suppliers: number[] = [];
    for (let index = 0; index < supplierNames.length; index += 1) {
      const inserted = await client.query(
        `INSERT INTO suppliers (name, payassure_merchant_id)
         VALUES ($1, $2) RETURNING id`,
        [
          supplierNames[index],
          `DEMO-PA-TEST-MERCHANT-${String(index + 1).padStart(4, "0")}`,
        ],
      );
      suppliers.push(Number(inserted.rows[0].id));
    }

    const medicines: Medicine[] = [];
    for (let index = 0; index < medicineCatalog.length; index += 1) {
      const [name, ingredient, prescriptionRequired, basePrice] =
        medicineCatalog[index];
      const supplierId = suppliers[index % suppliers.length];
      const priceCents = Number(basePrice) * 100;
      const initialStock = randomInt(70, 151) + randomInt(70, 151);
      const inserted = await client.query(
        `INSERT INTO products
           (name, supplier_id, price_cents, buying_price_cents, stock_count,
            active_ingredient, prescription_required)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          name,
          supplierId,
          priceCents,
          Math.round(Number(basePrice) * 60),
          initialStock,
          ingredient,
          prescriptionRequired,
        ],
      );
      const productId = Number(inserted.rows[0].id);
      const firstStock = randomInt(70, 151);
      const secondStock = initialStock - firstStock;
      const batchSpecs = [
        { code: `DEMO-${String(index + 1).padStart(3, "0")}-A`, stock: firstStock },
        { code: `DEMO-${String(index + 1).padStart(3, "0")}-B`, stock: secondStock },
      ];
      const batches: Medicine["batches"] = [];
      for (const [batchIndex, batchSpec] of batchSpecs.entries()) {
        const expiry = expiryDate(randomInt(100, 720) + batchIndex * 30);
        const batch = await client.query(
          `INSERT INTO product_batches (product_id, batch_code, expiry_date, stock_count)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [productId, batchSpec.code, expiry, batchSpec.stock],
        );
        batches.push({
          id: Number(batch.rows[0].id),
          code: batchSpec.code,
          expiry,
          stock: batchSpec.stock,
        });
      }
      medicines.push({
        id: productId,
        name: String(name),
        priceCents,
        prescriptionRequired: Boolean(prescriptionRequired),
        batches,
      });
    }

    const transactionCount = 360;
    const startTime = Date.now() - 90 * 86_400_000;
    for (let saleIndex = 0; saleIndex < transactionCount; saleIndex += 1) {
      const isTodaySale = saleIndex >= transactionCount - 12;
      const selected = new Set<number>();
      const desiredLines = isTodaySale ? 1 : randomInt(1, 4);
      if (isTodaySale) {
        selected.add((saleIndex - (transactionCount - 12)) % 12);
      } else {
        while (selected.size < desiredLines) {
          selected.add(randomInt(0, medicines.length));
        }
      }
      const saleItems: Array<{
        medicine: Medicine;
        batch: Medicine["batches"][number];
        quantity: number;
      }> = [];
      for (const medicineIndex of selected) {
        const medicine = medicines[medicineIndex];
        let remaining = isTodaySale ? 1 : randomInt(1, 4);
        for (const batch of medicine.batches.sort((a, b) =>
          a.expiry.localeCompare(b.expiry),
        )) {
          if (!remaining) break;
          const quantity = Math.min(remaining, batch.stock);
          if (!quantity) continue;
          batch.stock -= quantity;
          remaining -= quantity;
          saleItems.push({ medicine, batch, quantity });
        }
        if (remaining > 0) {
          for (const item of saleItems.filter(
            (saleItem) => saleItem.medicine.id === medicine.id,
          )) {
            item.batch.stock += item.quantity;
          }
          saleItems.splice(
            0,
            saleItems.length,
            ...saleItems.filter((saleItem) => saleItem.medicine.id !== medicine.id),
          );
        }
      }
      if (!saleItems.length) continue;

      const totalCents = saleItems.reduce(
        (sum, item) => sum + item.quantity * item.medicine.priceCents,
        0,
      );
      const prescriptionRequired = saleItems.some(
        (item) => item.medicine.prescriptionRequired,
      );
      const paymentMethod = saleIndex >= transactionCount - 4 ? "credit" : "cash";
      const createdAt = new Date(
        startTime + randomInt(0, 90 * 86_400_000),
      ).toISOString();
      const checkedBy = userRows[saleIndex % userRows.length];
      const sale = await client.query(
        `INSERT INTO sales
           (payment_method, status, total_cents, payer_name, payer_phone,
            prescription_reference, prescription_checked_by, created_at)
         VALUES ($1, 'completed', $2, $3, $4, $5, $6,
                 CASE WHEN $7 THEN NOW() ELSE $8::timestamptz END) RETURNING id`,
        [
          paymentMethod,
          totalCents,
          paymentMethod === "credit" ? `Demo Payer ${saleIndex + 1}` : null,
          paymentMethod === "credit"
            ? String(saleIndex + 1).padStart(10, "0")
            : null,
          prescriptionRequired
            ? `DEMO-RX-${String(saleIndex + 1).padStart(5, "0")}`
            : null,
          prescriptionRequired ? checkedBy.email : null,
          isTodaySale,
          createdAt,
        ],
      );
      const saleId = Number(sale.rows[0].id);
      for (const item of saleItems) {
        await client.query(
          "UPDATE product_batches SET stock_count = $2 WHERE id = $1",
          [item.batch.id, item.batch.stock],
        );
        await client.query(
          "UPDATE products SET stock_count = stock_count - $2 WHERE id = $1",
          [item.medicine.id, item.quantity],
        );
        await client.query(
          `INSERT INTO sale_items
             (sale_id, product_id, product_name, quantity, unit_price_cents,
              batch_id, batch_code, batch_expiry_date, buying_unit_price_cents,
              supplier_id, supplier_name)
           SELECT $1, $2, $3, $4, $5, $6, $7, $8, p.buying_price_cents,
                  p.supplier_id, s.name
           FROM products p JOIN suppliers s ON s.id = p.supplier_id
           WHERE p.id = $2`,
          [
            saleId,
            item.medicine.id,
            item.medicine.name,
            item.quantity,
            item.medicine.priceCents,
            item.batch.id,
            item.batch.code,
            item.batch.expiry,
          ],
        );
      }
    }

    for (const [index, failureReason] of [
      "Insufficient unexpired stock for requested item",
      "Checkout cancelled before payment",
      "Product quantity exceeded available stock",
    ].entries()) {
      await client.query(
        `INSERT INTO failed_checkout_attempts
           (payment_method, total_cents, failure_reason, created_by, created_at)
         VALUES ('cash', $1, $2, $3, NOW() - ($4 * INTERVAL '18 minutes'))`,
        [
          12500 + index * 4800,
          failureReason,
          userRows[index % userRows.length].email,
          index,
        ],
      );
    }

    await client.query("COMMIT");
    console.log(
      `Created ${supplierNames.length} suppliers, ${medicines.length} medicines, ` +
        `${medicines.length * 2} batches, and ${transactionCount} completed sale records, ` +
        "including 12 sales (4 on credit) and 3 failed checkout attempts today.",
    );
    if (newCredentials.length) {
      console.log("\nOne-time sample user credentials:");
      for (const credential of newCredentials) {
        console.log(`${credential.email}  ${credential.password}`);
      }
      console.log("Save these credentials now; passwords are not stored in recoverable form.");
    } else {
      console.log("Sample users already existed, so their passwords were not changed.");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedSampleData().catch((error: unknown) => {
  console.error("Could not create sample POS data:", error);
  process.exitCode = 1;
});

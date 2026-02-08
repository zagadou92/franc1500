// app/lib/data.ts
import postgres from 'postgres'
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  Revenue,
} from './definitions'
import { formatCurrency } from './utils'

// ------------------------------
// PostgreSQL connection
// ------------------------------
const sql = postgres(process.env.POSTGRES_URL ?? '', {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
  idle_timeout: 30,
  connect_timeout: 30,
  max_lifetime: 60,
})

// ------------------------------
// Test rapide de la connexion (optionnel)
// ------------------------------
;(async () => {
  try {
    const result = await sql`SELECT 1 AS test`
    console.log('✅ PostgreSQL connecté :', result[0])
  } catch (err) {
    console.error('❌ Erreur de connexion PostgreSQL :', err)
  }
})()

// ------------------------------
// Revenue
// ------------------------------
export async function fetchRevenue(): Promise<Revenue[]> {
  try {
    return await sql<Revenue[]>`SELECT * FROM revenue`
  } catch (error) {
    console.error('DB error (revenue):', error)
    return []
  }
}

// ------------------------------
// Latest Invoices
// ------------------------------
export async function fetchLatestInvoices(): Promise<LatestInvoiceRaw[]> {
  try {
    const data = await sql<LatestInvoiceRaw[]>`
      SELECT invoices.amount, customers.name, customers.image_url, customers.email, invoices.id
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      ORDER BY invoices.date DESC
      LIMIT 5
    `
    return data // reste des numbers, formatCurrency dans React
  } catch (error) {
    console.error('DB error (latest invoices):', error)
    return []
  }
}

// ------------------------------
// Dashboard cards
// ------------------------------
export async function fetchCardData() {
  try {
    const [invoices, customers, status] = await Promise.all([
      sql`SELECT COUNT(*) AS count FROM invoices`,
      sql`SELECT COUNT(*) AS count FROM customers`,
      sql`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS paid,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pending
        FROM invoices
      `,
    ])

    return {
      numberOfInvoices: Number(invoices[0]?.count ?? 0),
      numberOfCustomers: Number(customers[0]?.count ?? 0),
      totalPaidInvoices: Number(status[0]?.paid ?? 0),
      totalPendingInvoices: Number(status[0]?.pending ?? 0),
    }
  } catch (error) {
    console.error('DB error (cards):', error)
    return {
      numberOfInvoices: 0,
      numberOfCustomers: 0,
      totalPaidInvoices: 0,
      totalPendingInvoices: 0,
    }
  }
}

// ------------------------------
// Invoices
// ------------------------------
const ITEMS_PER_PAGE = 6

export async function fetchFilteredInvoices(
  query: string,
  currentPage: number
): Promise<InvoicesTable[]> {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE

  try {
    return await sql<InvoicesTable[]>`
      SELECT
        invoices.id,
        invoices.amount,
        invoices.date,
        invoices.status,
        customers.name,
        customers.email,
        customers.image_url
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE
        customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`} OR
        invoices.amount::text ILIKE ${`%${query}%`} OR
        invoices.date::text ILIKE ${`%${query}%`} OR
        invoices.status ILIKE ${`%${query}%`}
      ORDER BY invoices.date DESC
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `
  } catch (error) {
    console.error('DB error (filtered invoices):', error)
    return []
  }
}

export async function fetchInvoicesPages(query: string): Promise<number> {
  try {
    const data = await sql`
      SELECT COUNT(*) AS count
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE
        customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`} OR
        invoices.amount::text ILIKE ${`%${query}%`} OR
        invoices.date::text ILIKE ${`%${query}%`} OR
        invoices.status ILIKE ${`%${query}%`}
    `
    return Math.ceil(Number(data[0]?.count ?? 0) / ITEMS_PER_PAGE)
  } catch (error) {
    console.error('DB error (invoice pages):', error)
    return 0
  }
}

export async function fetchInvoiceById(id: string): Promise<InvoiceForm | null> {
  try {
    const data = await sql<InvoiceForm[]>`
      SELECT id, customer_id, amount, status
      FROM invoices
      WHERE id = ${id}
    `
    return data[0] ? { ...data[0], amount: data[0].amount / 100 } : null
  } catch (error) {
    console.error('DB error (invoice by id):', error)
    return null
  }
}

// ------------------------------
// Customers
// ------------------------------
export async function fetchCustomers(): Promise<CustomerField[]> {
  try {
    return await sql<CustomerField[]>`
      SELECT id, name
      FROM customers
      ORDER BY name ASC
    `
  } catch (error) {
    console.error('DB error (customers):', error)
    return []
  }
}

export async function fetchFilteredCustomers(
  query: string
): Promise<CustomersTableType[]> {
  try {
    const data = await sql<CustomersTableType[]>`
      SELECT
        customers.id,
        customers.name,
        customers.email,
        customers.image_url,
        COUNT(invoices.id) AS total_invoices,
        COALESCE(SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END), 0) AS total_pending,
        COALESCE(SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END), 0) AS total_paid
      FROM customers
      LEFT JOIN invoices ON customers.id = invoices.customer_id
      WHERE
        customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`}
      GROUP BY customers.id, customers.name, customers.email, customers.image_url
      ORDER BY customers.name ASC
    `
    return data.map((customer: CustomersTableType) => ({
      ...customer,
      total_pending: Number(customer.total_pending ?? 0),
      total_paid: Number(customer.total_paid ?? 0),
    }))
  } catch (error) {
    console.error('DB error (filtered customers):', error)
    return []
  }
}
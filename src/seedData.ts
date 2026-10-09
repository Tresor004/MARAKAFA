import { Product, Sale, Purchase, Customer, Supplier, User, Loss, InventoryCount, Role } from "./types";
import { NAV_ITEMS, NavKey } from "./components/nav";

const ALL_KEYS: NavKey[] = NAV_ITEMS.map(n => n.key);

const today = new Date().toISOString().slice(0, 10);
const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const pastMonth = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const seedProducts: Product[] = [
  { id: "p1", name: "Riz Basmati 5kg", category: "Epicerie", price: 8500, cost: 6500, stock: 45, minStock: 10, unit: "pièce", barcode: "100001", expiryDate: nextMonth },
  { id: "p2", name: "Huile Dinor 1L", category: "Epicerie", price: 2200, cost: 1700, stock: 80, minStock: 20, unit: "pièce", barcode: "100002", expiryDate: nextMonth },
  { id: "p3", name: "Sucre en poudre 1kg", category: "Epicerie", price: 950, cost: 700, stock: 120, minStock: 30, unit: "pièce", barcode: "100003" },
  { id: "p4", name: "Lait Bridel 1L", category: "Laitier", price: 1500, cost: 1100, stock: 35, minStock: 15, unit: "pièce", barcode: "100004", expiryDate: pastMonth },
  { id: "p5", name: "Yaourt Gervais x6", category: "Laitier", price: 1800, cost: 1350, stock: 25, minStock: 10, unit: "pièce", barcode: "100005", expiryDate: today },
  { id: "p6", name: "Coca-Cola 1.5L", category: "Boissons", price: 1250, cost: 950, stock: 60, minStock: 20, unit: "pièce", barcode: "100006" },
  { id: "p7", name: "Eau Cristaline 1.5L", category: "Boissons", price: 350, cost: 200, stock: 200, minStock: 50, unit: "pièce", barcode: "100007" },
  { id: "p8", name: "Pain de mie", category: "Boulangerie", price: 800, cost: 550, stock: 18, minStock: 8, unit: "pièce", barcode: "100008", expiryDate: today },
  { id: "p9", name: "Savon Lifebuoy", category: "Hygiène", price: 650, cost: 450, stock: 55, minStock: 15, unit: "pièce", barcode: "100009" },
  { id: "p10", name: "Lessive Omo 2kg", category: "Hygiène", price: 3200, cost: 2400, stock: 22, minStock: 8, unit: "pièce", barcode: "100010" },
  { id: "p11", name: "Pâtes Panzani 500g", category: "Epicerie", price: 750, cost: 550, stock: 90, minStock: 25, unit: "pièce", barcode: "100011" },
  { id: "p12", name: "Tomate concentrée", category: "Epicerie", price: 450, cost: 320, stock: 5, minStock: 20, unit: "pièce", barcode: "100012" },
];

export const seedCustomers: Customer[] = [
  { id: "c1", name: "Aïcha Diallo", phone: "77 123 45 67", email: "aicha@exemple.sn", address: "Dakar, Plateau", totalPurchases: 185000, createdAt: pastMonth },
  { id: "c2", name: "Mamadou Ndiaye", phone: "77 987 65 43", email: "mamadou@exemple.sn", address: "Dakar, Pikine", totalPurchases: 92000, createdAt: pastMonth },
  { id: "c3", name: "Fatou Niang", phone: "76 456 78 90", email: "fatou@exemple.sn", address: "Dakar, Fann", totalPurchases: 250000, createdAt: pastMonth },
  { id: "c4", name: "Abdoulaye Sow", phone: "70 234 56 78", email: "abdoulaye@exemple.sn", address: "Thiès", totalPurchases: 45000, createdAt: today },
];

export const seedSuppliers: Supplier[] = [
  { id: "s1", name: "SENEPAL", contact: "M. Diagne", phone: "33 800 00 00", email: "contact@senepal.sn", address: "Rufisque" },
  { id: "s2", name: "CIMENT DU SAHEL", contact: "Mme. Fall", phone: "33 850 00 00", email: "ventes@cimentsahel.sn", address: "Dakar" },
  { id: "s3", name: "BRIDEL", contact: "M. Camara", phone: "33 820 00 00", email: "bridel@bridel.sn", address: "Thiès" },
  { id: "s4", name: "COFIMA", contact: "Mme. Gueye", phone: "33 860 00 00", email: "cofima@cofima.sn", address: "Rufisque" },
];

export const seedRoles: Role[] = [
  {
    id: "admin", name: "Administrateur", isSystem: true, createdAt: pastMonth,
    description: "Accès complet à toutes les fonctionnalités de Hi-Market.",
    permissions: [...ALL_KEYS],
  },
  {
    id: "gestionnaire", name: "Gestionnaire", isSystem: true, createdAt: pastMonth,
    description: "Gère les stocks, achats et pertes. Pas d'accès à la gestion des employés.",
    permissions: ALL_KEYS.filter(k => k !== "users" && k !== "myspace"),
  },
  {
    id: "caissier", name: "Caissier", isSystem: true, createdAt: pastMonth,
    description: "Accès limité à la caisse, au catalogue produits et au tableau de bord. Toute modification nécessite validation admin.",
    permissions: ["dashboard", "products", "sales"],
  },
];

export const seedUsers: User[] = [
  { id: "u1", name: "Administrateur", email: "admin@himarket.sn", phone: "77 000 00 01", role: "admin", password: "admin123", active: true, createdAt: pastMonth },
  { id: "u2", name: "Fatou Ka", email: "fatou@himarket.sn", phone: "77 123 45 67", role: "caissier", password: "fatou123", active: true, createdAt: pastMonth },
  { id: "u3", name: "Ibrahima Mbaye", email: "ibrahima@himarket.sn", phone: "76 987 65 43", role: "gestionnaire", password: "ibrahima123", active: true, createdAt: pastMonth },
];

const genSale = (id: string, inv: string, items: { productId: string; name: string; qty: number; price: number }[], userId: string, userName: string, date: string, customer?: Customer, paidExtra = 0) => {
  const saleItems = items.map(i => ({ productId: i.productId, name: i.name, quantity: i.qty, price: i.price, total: i.qty * i.price }));
  const total = saleItems.reduce((a, b) => a + b.total, 0);
  return {
    id, invoiceNo: inv, items: saleItems, total,
    paid: total + paidExtra, change: paidExtra,
    customerId: customer?.id, customerName: customer?.name,
    userId, userName, date, paymentMethod: "Espèces"
  } as Sale;
};

export const seedSales: Sale[] = [
  genSale("v1", "FAC-2025-0001", [
    { productId: "p1", name: "Riz Basmati 5kg", qty: 2, price: 8500 },
    { productId: "p3", name: "Sucre en poudre 1kg", qty: 3, price: 950 },
    { productId: "p6", name: "Coca-Cola 1.5L", qty: 4, price: 1250 },
  ], "u2", "Fatou Ka", pastMonth, seedCustomers[0], 50),
  genSale("v2", "FAC-2025-0002", [
    { productId: "p4", name: "Lait Bridel 1L", qty: 5, price: 1500 },
    { productId: "p5", name: "Yaourt Gervais x6", qty: 2, price: 1800 },
  ], "u2", "Fatou Ka", pastMonth, seedCustomers[1]),
  genSale("v3", "FAC-2025-0003", [
    { productId: "p2", name: "Huile Dinor 1L", qty: 3, price: 2200 },
    { productId: "p11", name: "Pâtes Panzani 500g", qty: 6, price: 750 },
    { productId: "p7", name: "Eau Cristaline 1.5L", qty: 12, price: 350 },
  ], "u2", "Fatou Ka", today, seedCustomers[2], 100),
];

export const seedPurchases: Purchase[] = [
  {
    id: "a1", supplierId: "s1", supplierName: "SENEPAL", date: pastMonth, total: 325000, reference: "BA-2025-0001", managerName: "Ibrahima Mbaye",
    items: [
      { productId: "p1", name: "Riz Basmati 5kg", quantity: 50, price: 6500, total: 325000 },
    ]
  },
  {
    id: "a2", supplierId: "s3", supplierName: "BRIDEL", date: pastMonth, total: 110000, reference: "BA-2025-0002", managerName: "Ibrahima Mbaye",
    items: [
      { productId: "p4", name: "Lait Bridel 1L", quantity: 100, price: 1100, total: 110000 },
    ]
  },
];

export const seedLosses: Loss[] = [
  { id: "pe1", productId: "p4", productName: "Lait Bridel 1L", quantity: 5, unitPrice: 1100, total: 5500, reason: "Péremption", date: pastMonth, notedBy: "Ibrahima Mbaye" },
  { id: "pe2", productId: "p8", productName: "Pain de mie", quantity: 3, unitPrice: 550, total: 1650, reason: "Détérioration", date: pastMonth, notedBy: "Ibrahima Mbaye" },
];

export const seedInventory: InventoryCount[] = [
  { id: "i1", productId: "p1", productName: "Riz Basmati 5kg", expected: 50, actual: 48, difference: -2, date: pastMonth, period: "Semaine" },
  { id: "i2", productId: "p6", productName: "Coca-Cola 1.5L", expected: 60, actual: 60, difference: 0, date: pastMonth, period: "Semaine" },
];

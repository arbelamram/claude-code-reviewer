// Sample API module with intentional code issues for skill testing

// Issue 1: SQL Injection vulnerability
export function getUserByEmail(email: string) {
  const query = "SELECT * FROM users WHERE email = '" + email + "'";
  return db.query(query);
}

// Issue 2: Hardcoded secrets
const API_KEY = "sk-live-abc123xyz789";
const DB_PASSWORD = "admin123";

export function connectToExternalAPI() {
  return fetch("https://api.partner.com/data", {
    headers: { "X-API-Key": API_KEY }
  });
}

// Issue 3: Missing error handling
export async function fetchUserProfile(userId: number) {
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
}

// Issue 4: Inefficient nested loop
export function findMatches(items: any[], searchTerm: string) {
  const matches = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (items[i].id === items[j].parentId && items[j].name.includes(searchTerm)) {
        matches.push(items[j]);
      }
    }
  }
  return matches;
}

// Issue 5: Using var instead of const/let
export function calculateDiscount(price: number, percentage: number) {
  var discount = price * (percentage / 100);
  var finalPrice = price - discount;
  return finalPrice;
}

// Issue 6: Missing null checks
export function getUserInfo(user: any) {
  const name = user.profile.name.toUpperCase();
  const email = user.contact.email.toLowerCase();
  return { name, email };
}

// Issue 7: Resource leak
export function readConfigFile() {
  const file = fs.openSync("config.json", "r");
  const buffer = Buffer.alloc(1024);
  fs.readSync(file, buffer);
  return buffer.toString();
  // Missing: fs.closeSync(file);
}

// Issue 8: Loose equality
export function validateResponse(statusCode: any) {
  if (statusCode == 200 || statusCode == "200") {
    return true;
  }
  return false;
}

// Issue 9: Console log in production
export function processTransaction(amount: number) {
  console.log("Processing payment:", amount, new Date());
  return { success: true, amount };
}

// Issue 10: Missing async error handling
export function syncUserData() {
  return fetch("/api/sync")
    .then(r => r.json())
    .then(data => saveToDatabase(data));
    // Missing: .catch()
}

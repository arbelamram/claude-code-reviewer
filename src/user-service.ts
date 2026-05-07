// User service module with intentional code issues for testing

interface User {
  id: number;
  name: string;
  email: string;
}

// Issue 1: SQL Injection vulnerability
export function findUserByEmail(email: string): any {
  const query = "SELECT * FROM users WHERE email = '" + email + "'";
  return queryDatabase(query);
}

// Issue 2: Missing error handling
export async function fetchUser(userId: number): Promise<any> {
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
}

// Issue 3: Hardcoded credentials
const API_KEY = "sk-prod-1234567890abcdef";
const DB_PASSWORD = "admin@123";

export function getApiKey(): string {
  return API_KEY;
}

// Issue 4: Using var instead of const/let
export function calculateTax(amount: number): number {
  var taxRate = 0.1;
  var taxAmount = amount * taxRate;
  return taxAmount;
}

// Issue 5: Loose equality
export function checkStatus(code: any): boolean {
  if (code == 200) {
    return true;
  }
  return false;
}

// Issue 6: Missing null checks
export function getUserDisplayName(user: any): string {
  return user.profile.displayName.toUpperCase();
}

// Issue 7: Inefficient nested loop
export function findDuplicateUsers(users: User[]): User[] {
  const duplicates: User[] = [];
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      if (users[i].email === users[j].email) {
        duplicates.push(users[i]);
      }
    }
  }
  return duplicates;
}

// Issue 8: Console log in production
export function updateUser(user: User): void {
  console.log("Updating user:", user.id, new Date());
  const result = saveToDatabase(user);
  console.log("Save result:", result);
}

// Issue 9: Unhandled promise
export function syncUserData(): Promise<void> {
  return fetch("/api/sync")
    .then(r => r.json())
    .then(data => {
      saveToDatabase(data);
    });
}

// Issue 10: Generic error message
export function validateUser(user: any): boolean {
  if (!user || !user.email) {
    throw new Error("Error");
  }
  return true;
}

// Helper function (for testing purposes)
function queryDatabase(query: string): unknown {
  return { id: 1, name: "Test", email: "test@example.com" };
}

function saveToDatabase(data: any): boolean {
  return true;
}

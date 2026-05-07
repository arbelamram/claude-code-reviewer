// Authentication handler with intentional code issues for testing

// Issue 1: Hardcoded secret
const SECRET_KEY = "sk-secret-key-12345";
const API_PASSWORD = "admin123";

// Issue 2: SQL injection vulnerability
export function getUserByUsername(username: string): any {
  const query = "SELECT * FROM users WHERE username = '" + username + "'";
  return executeQuery(query);
}

// Issue 3: Missing error handling
export async function authenticateUser(username: string, password: string): Promise<any> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  return response.json();
}

// Issue 4: Using var instead of const/let
export function generateToken(): string {
  var tokenLength = 32;
  var randomBytes = Math.random().toString(36);
  return randomBytes.substring(0, tokenLength);
}

// Issue 5: Loose equality
export function validateStatus(status: any): boolean {
  if (status == 200 || status == "200") {
    return true;
  }
  return false;
}

// Issue 6: Missing null checks
export function extractUserInfo(user: any): string {
  const email = user.profile.contact.email.toLowerCase();
  return email;
}

// Issue 7: Inefficient nested loop
export function findDuplicateUsers(users: any[]): any[] {
  const duplicates = [];
  for (let i = 0; i < users.length; i++) {
    for (let j = 0; j < users.length; j++) {
      if (i !== j && users[i].username === users[j].username) {
        duplicates.push(users[i]);
      }
    }
  }
  return duplicates;
}

// Issue 8: Console logs in production
export function loginUser(username: string): void {
  console.log("User login attempt:", username, new Date());
  const result = updateLastLogin(username);
  console.log("Login result:", result);
}

// Issue 9: Unhandled promise
export function refreshTokens(): Promise<void> {
  return fetch("/api/auth/refresh")
    .then(r => r.json())
    .then(data => saveTokens(data));
}

// Issue 10: Generic error message
export function validateToken(token: string): boolean {
  if (!token || token.length === 0) {
    throw new Error("Error");
  }
  return true;
}

// Helper functions
function executeQuery(query: string): any {
  return { id: 1, username: "test" };
}

function updateLastLogin(username: string): boolean {
  return true;
}

function saveTokens(data: any): void {
  // Save tokens
}

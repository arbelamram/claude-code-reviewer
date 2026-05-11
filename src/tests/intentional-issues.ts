import * as fs from 'fs';

// Intentional Issue 1 (security/high): hardcoded credentials
const DB_PASSWORD = 'super_secret_password123';
const API_KEY = 'sk-prod-abc123xyz789';

interface User {
  id: number;
  username: string;
  password: string;
  email: string;
}

// Intentional Issue 2 (security/high): SQL injection via string concatenation
async function getUserByName(username: string): Promise<User | null> {
  const query = `SELECT * FROM users WHERE username = '${username}'`;
  console.log(`Executing query: ${query}`);
  // db.execute(query);
  return null;
}

// Intentional Issue 3 (best-practice/high): logging sensitive user data
async function authenticateUser(username: string, password: string): Promise<boolean> {
  console.log(`Authenticating user: ${username}, password: ${password}`);
  const user = await getUserByName(username);
  if (!user) {
    return false;
  }
  return user.password === password;
}

// Intentional Issue 4 (performance/medium): reading large file synchronously inside a loop
function processFiles(filePaths: string[]): string[] {
  const results: string[] = [];
  for (const filePath of filePaths) {
    const content = fs.readFileSync(filePath, 'utf-8');
    results.push(content.toUpperCase());
  }
  return results;
}

// Intentional Issue 5 (style/low): deeply nested logic, hard to read
function checkPermissions(user: any): boolean {
  if (user) {
    if (user.role) {
      if (user.role === 'admin') {
        if (user.active) {
          if (user.verified) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export { getUserByName, authenticateUser, processFiles, checkPermissions };

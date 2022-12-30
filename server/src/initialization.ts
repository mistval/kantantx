import { IDatabaseAdapter } from "./types/database_adapter";

export async function initializeAdminUser(database: IDatabaseAdapter) {
  const adminUserExists = await database.adminUserExists();

  if (!adminUserExists) {
    const adminUsername = process.env['ADMIN_USERNAME'];
    const adminPassword = process.env['ADMIN_PASSWORD'];

    if (!adminUsername) {
      throw new Error('No admin username specified. Please set the ADMIN_USERNAME and ADMIN_PASSWORD environment variables and try again.');
    }

    if (!adminPassword) {
      throw new Error('No admin password specified. Please set the ADMIN_USERNAME and ADMIN_PASSWORD environment variables and try again.');
    }
  }
}

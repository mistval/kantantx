import { Controller } from "./controller";
import { Role } from "./types/enums";

export async function initializeAdminUser(controller: Controller) {
  const adminUserExists = await controller.adminUserExists();

  if (!adminUserExists) {
    const adminUsername = process.env['ADMIN_USERNAME'];
    const adminPassword = process.env['ADMIN_PASSWORD'];

    if (!adminUsername) {
      throw new Error('No admin username specified. Please set the ADMIN_USERNAME and ADMIN_PASSWORD environment variables and try again.');
    }

    if (!adminPassword) {
      throw new Error('No admin password specified. Please set the ADMIN_USERNAME and ADMIN_PASSWORD environment variables and try again.');
    }

    await controller.createUser({
      username: adminUsername,
      password: adminPassword,
      role: Role.ADMIN,
      languageCodes: [],
    });
  }
}

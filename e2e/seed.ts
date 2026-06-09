/**
 * Seed-data contract — must match the backend `create_e2e_data` management
 * command. The specs assume these records exist (verified + active users, a
 * team with rsvp_enabled, one program, one sport).
 */
export const SEED = {
  manager: { email: 'e2e-manager@foxugly.com', password: 'e2e-Passw0rd!' },
  athlete: { email: 'e2e-athlete@foxugly.com', password: 'e2e-Passw0rd!' },
  team: 'E2E Team',
  program: 'E2E Program',
  sport: 'E2E Sport',
} as const;

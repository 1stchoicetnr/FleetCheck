import { SharedAppUser } from "./shared-types";

export const SEEDED_APP_USERS: SharedAppUser[] = [
  {
    id: "user-ashley",
    name: "Ashley",
    email: "ashley@fleetcheck.local",
    role: "super_admin",
    active: true,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "user-james",
    name: "James",
    email: "james@fleetcheck.local",
    role: "super_admin",
    active: true,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "user-office",
    name: "Office",
    email: "office@fleetcheck.local",
    role: "management",
    active: true,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "user-tech",
    name: "Tech",
    email: "tech@fleetcheck.local",
    role: "tech",
    active: true,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "user-driver",
    name: "Driver",
    email: "driver@fleetcheck.local",
    role: "driver",
    active: true,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
];

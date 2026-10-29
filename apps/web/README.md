# Web Application Blueprint (`apps/web/`)

Frontend Vue 3 Single Page Application and Progressive Web Application (PWA) for Bull Dog Solution.

## Subdirectories & Components

| Directory                                  | Type          | Description                                                                             |
| ------------------------------------------ | ------------- | --------------------------------------------------------------------------------------- |
| [`src/`](./src/README.md)                  | Blueprint     | Frontend application root, router, global stores, shared utilities, and domain modules. |
| [`public/`](./public/manifest.webmanifest) | Static Assets | Web app manifest, service worker (`sw.js`), and application icons.                      |

## Interface & Modules

| Module Route          | Directory                                                                     | Description                                                            |
| --------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `/`                   | [`src/modules/home/`](./src/modules/home/README.md)                           | Landing dashboard and role-based redirector.                           |
| `/login`              | [`src/modules/auth/`](./src/modules/auth/README.md)                           | Authentication view and session establishment.                         |
| `/orders`             | [`src/modules/orders/`](./src/modules/orders/README.md)                       | Order listing, multi-step creation wizard, and order management.       |
| `/execution`          | [`src/modules/service-execution/`](./src/modules/service-execution/README.md) | Mobile technician field portal for checklists, photos, and signatures. |
| `/inventory`          | [`src/modules/inventory/`](./src/modules/inventory/README.md)                 | Local hardware inventory catalog and equipment lifecycle views.        |
| `/clients`            | [`src/modules/clients/`](./src/modules/clients/README.md)                     | Client report email configuration.                                     |
| `/technicians`        | [`src/modules/technicians/`](./src/modules/technicians/README.md)             | Technician directory and status listing.                               |
| `/technical-accounts` | [`src/modules/technicians/`](./src/modules/technicians/README.md)             | Shared workshop technician accounts and order access configuration.    |
| `/sync`               | [`src/modules/sync/`](./src/modules/sync/README.md)                           | Outbox synchronization dashboard and manual retry triggers.            |
| `/admin-users`        | [`src/modules/admin-users/`](./src/modules/admin-users/README.md)             | User account administration.                                           |

## Invariants

- **Role-Based Guards**: Vue Router guards restrict routes according to user role (`ADMIN` vs `TECHNICIAN`).
- **Reactive State Management**: Pinia stores handle user sessions and UI themes; TanStack Query manages server cache and optimistic updates.
- **Mobile-First Responsiveness**: Execution views are optimized for field use on mobile devices and tablets.

## Verification

```bash
pnpm --filter @puk/web test
```

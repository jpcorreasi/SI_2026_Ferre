# Ferretería Web — Frontend React + TypeScript (v2.0)

Migración del SPA monolítico (`../frontend/templates/frontend/index.html`, vanilla JS)
a **React + TypeScript + Vite**, consumiendo la API NestJS (`../ferreteria-api`).
Reutiliza el **design system** original (CSS variables + modo oscuro) para mantener
la estética idéntica.

## Stack

- **Vite 5** + **React 18** + **TypeScript 5**
- **React Router 6** (rutas SPA)
- **TanStack Query 5** (fetching, cache, paginación, mutaciones)
- Design system portado tal cual (`src/styles/design-system.css`)

## Puesta en marcha

```bash
npm install
cp .env.example .env          # VITE_API_TARGET apunta al backend NestJS
npm run dev                   # http://localhost:5173  (proxy /api -> :3000)
```

Requiere el backend corriendo (`cd ../ferreteria-api && npm run start:dev`).

```bash
npm run build       # typecheck (tsc --noEmit) + bundle de producción
npm run typecheck
npm run preview
```

## Arquitectura

```
src/
  lib/        api.ts (fetch + refresh JWT), auth.ts (tokens/JWT), format.ts, download.ts (blob)
  context/    AuthContext, ThemeContext (dark mode), ToastContext
  types/      api.ts (tipos del contrato DRF)
  components/
    Icon.tsx           (SVG estilo Lucide, reutiliza los paths del SPA)
    ui/                Modal, Pagination, States (loading/error/empty)
    layout/            AppLayout (sidebar + topbar + drawer), SidebarNav, nav.ts
  pages/      Login, Dashboard, Products, Sales, Placeholder
  styles/     design-system.css (portado), app.css (añadidos)
```

### Decisiones clave

- **Auth:** tokens en `localStorage`; `api.ts` adjunta `Authorization: Bearer` y
  **refresca automáticamente** en 401 (reintenta una vez; si falla, fuerza logout).
  Login maneja **401** (credenciales) y **423** (cuenta bloqueada).
- **Estado servidor:** TanStack Query con `keepPreviousData` para paginación fluida
  y `invalidateQueries` tras mutaciones.
- **Paginación:** componente `Pagination` para la forma DRF `{count,next,previous,results}`.
- **Descargas PDF/CSV:** `authedDownload()` hace fetch con el JWT y dispara la
  descarga vía object URL (el header Authorization no cabe en un `<a download>`).
- **Rol:** la navegación oculta las secciones `adminOnly`; el backend aplica los permisos.
- **Modo oscuro:** `data-theme` en `<html>`, persistido.

## Hoja de ruta de pantallas

- [x] **Fundación:** auth/login, layout (sidebar/drawer/topbar/dark), API client con
      refresh, tipos, UI base (modal/paginación/toasts/estados), routing con guard.
- [x] **Núcleo:** Dashboard (KPIs + top productos + bajo stock), Productos (lista +
      filtros + CRUD modal), Ventas (lista + filtros + detalle + cancelar + PDF).
- [x] **Nueva venta** (carrito 2 pasos: productos → cliente/pago → confirmar) y
      **Clientes** (lista + filtros + alta/edición; EMPLEADO solo edita contacto).
- [x] **Servicios** (lista + filtros + alta/edición; precio autocompletado por tipo)
      y **Proveedores** (ADMIN, lista + CRUD).
- [x] **Reportes** (ADMIN: resumen de ventas, balance financiero, ventas por
      modalidad de pago con **export CSV/PDF**) y **Facturas de cliente**
      (lista + generar desde venta + PDF + enviar por email).
- [x] **Empleados** (ADMIN; el alta crea el usuario vinculado) y **Nóminas**
      (ADMIN; crear + aprobar → genera el egreso en finanzas).
- [x] **Finanzas:** **Caja** (abrir/saldo/retiro[ADMIN]/cerrar + historial),
      **Gastos** (ADMIN; CRUD + categorías) y **Transacciones** (libro contable
      de solo lectura con filtros).
- [x] **Compras:** **Órdenes de compra** (ADMIN; crear con items + recibir/cancelar)
      y **Solicitudes de pedido** (crear ambos roles; `mark-reviewed` ADMIN).
- [x] **Sistema:** **Auditoría** (ADMIN, solo lectura; filtros + detalle de cambios
      `{old,new}`) y **Usuarios** (ADMIN; CRUD con rol y contraseña).
- [x] **Finales:** **Horarios** (EMPLEADO ve el suyo; ADMIN crea turnos + copia a
      la siguiente semana), **Notas crédito** (ADMIN crea seleccionando ítems de una
      venta a devolver + PDF) y **Facturas de proveedor** (ADMIN; crear con items →
      incrementa stock).

✅ **Frontend completo:** las 19 pantallas del SPA original están migradas a React + TypeScript.

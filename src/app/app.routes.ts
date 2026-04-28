import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { staffGuard } from './core/auth/staff.guard';
import { AdminLayoutComponent } from './core/layout/admin-layout/admin-layout.component';
import { AuthLayoutComponent } from './core/layout/auth-layout/auth-layout.component';
import { MainLayoutComponent } from './core/layout/main-layout/main-layout.component';

export const routes: Routes = [
  {
    path: 'login',
    component: AuthLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/auth/login/login.component').then((m) => m.LoginComponent),
      },
    ],
  },
  {
    path: 'admin',
    component: MainLayoutComponent,
    canActivate: [authGuard, staffGuard],
    children: [
      {
        path: '',
        component: AdminLayoutComponent,
        children: [
          { path: '', redirectTo: 'sports', pathMatch: 'full' },
          {
            path: 'sports',
            loadChildren: () =>
              import('./features/admin/sports/sports.routes').then((m) => m.SPORTS_ROUTES),
          },
          {
            path: 'energy-systems',
            loadChildren: () =>
              import('./features/admin/energy-systems/energy-systems.routes').then(
                (m) => m.ENERGY_SYSTEMS_ROUTES,
              ),
          },
          {
            path: 'energy-segments',
            loadComponent: () =>
              import(
                './features/admin/energy-segments/energy-segments-placeholder.component'
              ).then((m) => m.EnergySegmentsPlaceholderComponent),
          },
          {
            path: 'modalities',
            loadComponent: () =>
              import('./features/admin/modalities/modalities-placeholder.component').then(
                (m) => m.ModalitiesPlaceholderComponent,
              ),
          },
        ],
      },
    ],
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];

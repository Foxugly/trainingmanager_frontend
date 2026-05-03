import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { staffGuard } from './core/auth/staff.guard';
import { AdminLayoutComponent } from './core/layout/admin-layout/admin-layout.component';
import { AuthLayoutComponent } from './core/layout/auth-layout/auth-layout.component';
import { MainLayoutComponent } from './core/layout/main-layout/main-layout.component';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () =>
      import('./features/home/home.component').then((m) => m.HomeComponent),
  },
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
    path: 'invitation/:token',
    component: AuthLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/auth/invitation-accept/invitation-accept.component').then(
            (m) => m.InvitationAcceptComponent,
          ),
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
            loadChildren: () =>
              import('./features/admin/energy-segments/energy-segments.routes').then(
                (m) => m.ENERGY_SEGMENTS_ROUTES,
              ),
          },
          {
            path: 'modalities',
            loadComponent: () =>
              import(
                './features/admin/modalities/modalities-hub/modalities-hub.component'
              ).then((m) => m.ModalitiesHubComponent),
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
        redirectTo: 'dashboard',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
      {
        path: 'events',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/events/events-calendar/events-calendar.component').then(
                (m) => m.EventsCalendarComponent,
              ),
          },
          {
            path: 'new',
            loadComponent: () =>
              import('./features/events/events-form/events-form.component').then(
                (m) => m.EventsFormComponent,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/events/events-detail/events-detail.component').then(
                (m) => m.EventsDetailComponent,
              ),
          },
          {
            path: ':id/edit',
            loadComponent: () =>
              import('./features/events/events-form/events-form.component').then(
                (m) => m.EventsFormComponent,
              ),
          },
          {
            path: ':id/attendance',
            loadComponent: () =>
              import('./features/events/events-attendance/events-attendance.component').then(
                (m) => m.EventsAttendanceComponent,
              ),
          },
        ],
      },
      {
        path: 'programs',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/programs/programs-list/programs-list.component').then(
                (m) => m.ProgramsListComponent,
              ),
          },
          {
            path: 'new',
            loadComponent: () =>
              import('./features/programs/programs-form/programs-form.component').then(
                (m) => m.ProgramsFormComponent,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/programs/programs-detail/programs-detail.component').then(
                (m) => m.ProgramsDetailComponent,
              ),
          },
          {
            path: ':id/edit',
            loadComponent: () =>
              import('./features/programs/programs-form/programs-form.component').then(
                (m) => m.ProgramsFormComponent,
              ),
          },
        ],
      },
      {
        path: 'teams',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/teams/teams-list/teams-list.component').then(
                (m) => m.TeamsListComponent,
              ),
          },
          {
            path: 'new',
            loadComponent: () =>
              import('./features/teams/teams-form/teams-form.component').then(
                (m) => m.TeamsFormComponent,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/teams/teams-detail/teams-detail.component').then(
                (m) => m.TeamsDetailComponent,
              ),
          },
          {
            path: ':id/edit',
            loadComponent: () =>
              import('./features/teams/teams-form/teams-form.component').then(
                (m) => m.TeamsFormComponent,
              ),
          },
        ],
      },
      { path: '**', redirectTo: '' },
    ],
  },
];

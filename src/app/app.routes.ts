import { CanActivateFn, Router, Routes } from '@angular/router';
import { inject } from '@angular/core';
import { authGuard } from './core/auth/auth.guard';
import { staffGuard } from './core/auth/staff.guard';
import { AuthService } from './core/auth/auth.service';
import { AdminLayoutComponent } from './core/layout/admin-layout/admin-layout.component';
import { MainLayoutComponent } from './core/layout/main-layout/main-layout.component';
import { PublicLayoutComponent } from './core/layout/public-layout/public-layout.component';

const redirectAuthenticatedToDashboard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  if (authService.currentUser() === null) return true;
  return router.createUrlTree(['/dashboard']);
};

export const routes: Routes = [
  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: [redirectAuthenticatedToDashboard],
        loadComponent: () =>
          import('./features/home/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'home',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/home/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'features',
        loadComponent: () =>
          import('./features/features-page/features-page.component').then(
            (m) => m.FeaturesPageComponent,
          ),
      },
      {
        path: 'contribute',
        loadComponent: () =>
          import('./features/contribute-page/contribute-page.component').then(
            (m) => m.ContributePageComponent,
          ),
      },
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login.component').then((m) => m.LoginComponent),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
      },
      {
        path: 'check-your-email',
        loadComponent: () =>
          import('./features/auth/check-your-email/check-your-email.component').then(
            (m) => m.CheckYourEmailComponent,
          ),
      },
      {
        path: 'auth/confirm-email/:key',
        loadComponent: () =>
          import('./features/auth/email-confirm/email-confirm.component').then(
            (m) => m.EmailConfirmComponent,
          ),
      },
      {
        path: 'invitation/:token',
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
            path: 'discover',
            loadComponent: () =>
              import('./features/teams/teams-discover/teams-discover.component').then(
                (m) => m.TeamsDiscoverComponent,
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

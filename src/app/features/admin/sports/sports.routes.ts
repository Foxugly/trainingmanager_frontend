import { Routes } from '@angular/router';

export const SPORTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./sports-list/sports-list.component').then((m) => m.SportsListComponent),
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./sports-form/sports-form.component').then((m) => m.SportsFormComponent),
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./sports-form/sports-form.component').then((m) => m.SportsFormComponent),
  },
  {
    path: ':sportId/modalities',
    loadComponent: () =>
      import('../modalities/modalities-list/modalities-list.component').then(
        (m) => m.ModalitiesListComponent,
      ),
  },
  {
    path: ':sportId/modalities/new',
    loadComponent: () =>
      import('../modalities/modalities-form/modalities-form.component').then(
        (m) => m.ModalitiesFormComponent,
      ),
  },
  {
    path: ':sportId/modalities/:id/edit',
    loadComponent: () =>
      import('../modalities/modalities-form/modalities-form.component').then(
        (m) => m.ModalitiesFormComponent,
      ),
  },
];

import { Routes } from '@angular/router';

export const ENERGY_SEGMENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./energy-segments-list/energy-segments-list.component').then(
        (m) => m.EnergySegmentsListComponent,
      ),
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./energy-segments-form/energy-segments-form.component').then(
        (m) => m.EnergySegmentsFormComponent,
      ),
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./energy-segments-form/energy-segments-form.component').then(
        (m) => m.EnergySegmentsFormComponent,
      ),
  },
];

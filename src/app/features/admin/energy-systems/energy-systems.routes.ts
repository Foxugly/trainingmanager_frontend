import { Routes } from '@angular/router';

export const ENERGY_SYSTEMS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./energy-systems-list/energy-systems-list.component').then(
        (m) => m.EnergySystemsListComponent,
      ),
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./energy-systems-form/energy-systems-form.component').then(
        (m) => m.EnergySystemsFormComponent,
      ),
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./energy-systems-form/energy-systems-form.component').then(
        (m) => m.EnergySystemsFormComponent,
      ),
  },
];

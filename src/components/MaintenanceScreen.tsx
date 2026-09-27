import { Wrench } from 'lucide-react';

export default function MaintenanceScreen() {
  return (
    <div className="min-h-screen bg-sand-50 dark:bg-sand-900 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-ocre-100 flex items-center justify-center mx-auto mb-5">
          <Wrench className="w-8 h-8 text-ocre-600" />
        </div>
        <h1 className="font-display text-2xl font-bold text-sand-900 mb-2">RATELAFRICA revient bientôt</h1>
        <p className="text-sand-500">Nous effectuons une opération de maintenance pour améliorer votre expérience. Merci de votre patience, nous serons de retour très prochainement.</p>
      </div>
    </div>
  );
}

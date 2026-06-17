import { useMemo, useState } from "react";
import { BadgeDollarSign, Landmark, TrendingUp } from "lucide-react";

type FinancingOption = {
  months: number;
  monthlyPayment: number;
  clinicAdvance: number;
  platformFee: number;
  projectedCashflow: number;
};

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

export function FinancingSimulator() {
  const [treatmentCost, setTreatmentCost] = useState(450000);
  const [advanceRate, setAdvanceRate] = useState(0.82);
  const [platformFeeRate, setPlatformFeeRate] = useState(0.045);

  const options = useMemo<FinancingOption[]>(() => {
    return [3, 6, 9, 12].map((months) => {
      const financingRate = months <= 3 ? 0.08 : months <= 6 ? 0.14 : months <= 9 ? 0.2 : 0.27;
      const financedTotal = treatmentCost * (1 + financingRate);
      const platformFee = treatmentCost * platformFeeRate;
      const clinicAdvance = treatmentCost * advanceRate - platformFee;

      return {
        months,
        monthlyPayment: financedTotal / months,
        clinicAdvance,
        platformFee,
        projectedCashflow: clinicAdvance + treatmentCost * (1 - advanceRate)
      };
    });
  }, [advanceRate, platformFeeRate, treatmentCost]);

  const bestOption = options.reduce((best, option) =>
    option.monthlyPayment < best.monthlyPayment ? option : best
  );

  return (
    <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-soft">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-clinic-accent">
            <BadgeDollarSign size={22} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-clinic-ink">
            Simulador de financiamiento
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-clinic-muted">
            Calcula cuotas para tratamientos y estima el flujo de caja que recibiria la clinica.
          </p>
        </div>
        <div className="rounded-lg bg-clinic-surface px-4 py-3 text-sm text-clinic-muted">
          API futura: scoring crediticio, motor antifraude y red P2P de fondeo.
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <label>
          <span className="text-sm font-medium text-clinic-ink">Costo del tratamiento</span>
          <input
            type="number"
            min="0"
            value={treatmentCost}
            onChange={(event) => setTreatmentCost(Number(event.target.value))}
            className="mt-2 w-full rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
          />
        </label>
        <label>
          <span className="text-sm font-medium text-clinic-ink">Anticipo a la clinica</span>
          <select
            value={advanceRate}
            onChange={(event) => setAdvanceRate(Number(event.target.value))}
            className="mt-2 w-full rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
          >
            <option value={0.72}>72%</option>
            <option value={0.82}>82%</option>
            <option value={0.9}>90%</option>
          </select>
        </label>
        <label>
          <span className="text-sm font-medium text-clinic-ink">Fee plataforma</span>
          <select
            value={platformFeeRate}
            onChange={(event) => setPlatformFeeRate(Number(event.target.value))}
            className="mt-2 w-full rounded-lg border border-clinic-line px-4 py-3 outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
          >
            <option value={0.035}>3.5%</option>
            <option value={0.045}>4.5%</option>
            <option value={0.06}>6%</option>
          </select>
        </label>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {options.map((option) => (
          <article
            key={option.months}
            className={`rounded-lg border p-4 ${
              option.months === bestOption.months
                ? "border-clinic-accent bg-blue-50"
                : "border-clinic-line bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold text-clinic-ink">{option.months} cuotas</p>
              {option.months === bestOption.months && (
                <span className="rounded-lg bg-clinic-accent px-2 py-1 text-xs font-semibold text-white">
                  menor cuota
                </span>
              )}
            </div>
            <p className="mt-4 text-2xl font-semibold text-clinic-ink">
              {currency.format(option.monthlyPayment)}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-clinic-muted">Anticipo neto</dt>
                <dd className="font-medium text-clinic-ink">{currency.format(option.clinicAdvance)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-clinic-muted">Fee estimado</dt>
                <dd className="font-medium text-clinic-ink">{currency.format(option.platformFee)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-clinic-muted">Cashflow total</dt>
                <dd className="font-medium text-clinic-ink">
                  {currency.format(option.projectedCashflow)}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="mt-5 grid gap-3 rounded-lg border border-clinic-line bg-clinic-surface p-4 text-sm text-clinic-muted md:grid-cols-2">
        <p className="flex items-start gap-2">
          <Landmark size={18} className="mt-0.5 text-clinic-brand" />
          `requestCreditScore(patientId, treatmentCost)` puede conectarse con bureau, Open Finance o
          proveedores BNPL.
        </p>
        <p className="flex items-start gap-2">
          <TrendingUp size={18} className="mt-0.5 text-clinic-brand" />
          `publishLoanToMarketplace(option)` puede derivar la operacion a inversores o red P2P.
        </p>
      </div>
    </section>
  );
}

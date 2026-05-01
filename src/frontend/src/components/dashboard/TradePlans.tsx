import { motion } from "framer-motion";
import type { TradePlan } from "../../types/portfolio";
import { money } from "../../utils/formatters";

type TradePlansProps = {
  plans: TradePlan[];
};

export function TradePlans({ plans }: TradePlansProps) {
  const buys = plans.filter((plan) => plan.side === "Buy").length;
  const sells = plans.length - buys;

  return (
    <section className="plans-panel">
      <div className="section-header">
        <h2>Trade plans</h2>
        <span>
          {buys} buy triggers · {sells} sell triggers
        </span>
      </div>
      <div className="plans-grid">
        {plans.map((plan, index) => (
          <motion.article
            animate={{ opacity: 1, y: 0 }}
            className="plan-card"
            initial={{ opacity: 0, y: 12 }}
            key={plan.id}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            whileHover={{ y: -3 }}
          >
            <div className="plan-topline">
              <div>
                <strong>{plan.symbol}</strong>
                <span>{plan.name}</span>
              </div>
              <span className={plan.side === "Buy" ? "plan-side buy" : "plan-side sell"}>{plan.side}</span>
            </div>
            <div className="plan-metrics">
              <div>
                <span>When it hits</span>
                <strong>{money.format(plan.triggerPrice)}</strong>
              </div>
              <div>
                <span>Now</span>
                <strong>{money.format(plan.currentPrice)}</strong>
              </div>
              <div>
                <span>Shares</span>
                <strong>{plan.quantity}</strong>
              </div>
            </div>
            <div className="confidence-track" aria-label={`${plan.confidence}% confidence`}>
              <span style={{ width: `${plan.confidence}%` }} />
            </div>
            <div className="plan-status">
              <strong>{plan.status}</strong>
              <span>{plan.confidence}% confidence</span>
            </div>
            <p>{plan.reason}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

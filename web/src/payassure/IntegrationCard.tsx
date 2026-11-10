import type { RetailerProfileData } from "../types";
import { display, displayDateTime } from "./payassureUtils";

function IntegrationCard({ profile }: { profile: RetailerProfileData }) {
  return (
    <article className="panel retailer-card">
      <div className="retailer-card-heading">
        <div><h2>Integration</h2><p>PayAssure merchant connection</p></div>
      </div>
      {profile.integration ? (
        <dl className="retailer-fields">
          <div className="retailer-field"><dt>API key</dt><dd>{display(profile.integration.apiKey)}</dd></div>
          <div className="retailer-field"><dt>API secret</dt><dd>{display(profile.integration.apiSecret)}</dd></div>
          <div className="retailer-field"><dt>Merchant ID</dt><dd>{display(profile.integration.merchantId)}</dd></div>
          <div className="retailer-field"><dt>Environment</dt><dd>{display(profile.integration.environment)}</dd></div>
          <div className="retailer-field"><dt>Integration active</dt><dd>{display(profile.integration.isActive)}</dd></div>
          <div className="retailer-field">
            <dt>Created at</dt><dd>{displayDateTime(profile.integration.createdAt)}</dd>
          </div>
        </dl>
      ) : <p className="retailer-empty">No integration was provided.</p>}
    </article>
  );
}

export default IntegrationCard;

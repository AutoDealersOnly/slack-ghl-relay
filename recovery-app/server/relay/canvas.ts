import type { DealershipProperties, ProductionProperties } from "./types";

const clean = (value: unknown): string =>
  String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\|/g, "\\|")
    .trim();

const formatDate = (value: string | undefined): string => {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return clean(value);
  return new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day))
  );
};

const formatPhone = (value: string | undefined): string => {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return normalized.length === 10
    ? `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`
    : clean(value);
};

const canvasRow = (label: string, value: unknown) => `| ${label} | ${clean(value)} |`;

export function buildProductionCanvas(
  production: ProductionProperties,
  dealership: DealershipProperties
): string {
  const address = [dealership.street_address, dealership.city, dealership.state, dealership.zip]
    .filter(Boolean)
    .join(", ");
  const updatedAt = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date());

  return [
    "# GHL Production Details",
    "",
    "| Field | Value |",
    "|:---|:---|",
    "| **Campaign information** | |",
    canvasRow("Production", production.production),
    canvasRow("Dealership", dealership.dealership_name),
    canvasRow("Event Start", formatDate(production.event_start)),
    canvasRow("Event End", formatDate(production.event_end)),
    canvasRow("SCF Date", formatDate(production.scf_date)),
    "| **Dealership information** | |",
    canvasRow("Address", address),
    canvasRow("Sales Hours", dealership.hours),
    canvasRow("Tracking #", formatPhone(dealership.tracking)),
    canvasRow("Tracking # 2", formatPhone(dealership.tracking__2)),
    canvasRow("Website", dealership.website),
    canvasRow("Alias", dealership.alias),
    canvasRow("Position", dealership.alias_position),
    "| **Production details** | |",
    canvasRow("Mailer", production.mailer),
    canvasRow("Mailer 2", production.mailer_2),
    canvasRow("Mail Count", production.mail_count),
    canvasRow("Job #", production.job_numbers),
    canvasRow("Pin Code Ranges", production.pin_code_ranges),
    "| **Team** | |",
    canvasRow("Sales Rep", production.sales_rep),
    canvasRow("Closer", production.closer),
    canvasRow("Greeter", production.greeter),
    "",
    "---",
    `*Last updated: ${updatedAt}*`,
  ].join("\n");
}

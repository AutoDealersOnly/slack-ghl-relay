import { describe, expect, it } from "vitest";
import { campaignCustomValues } from "./ghl";

describe("campaignCustomValues", () => {
  it("maps the approved same-month campaign values with Alias-based contact fields", () => {
    expect(
      campaignCustomValues(
        {
          event_start: "2026-08-21",
          event_end: "2026-08-23",
          mailer: "DM108",
          mailer_2: "DM109",
          closer: "Chris Closer",
          greeter: "Jamie Greeter",
        },
        { alias: "Bobby Lamb", alias_position: "General Manager" }
      )
    ).toEqual({
      campaign_dates: "August 21-23",
      campaign_start_date: "August 21",
      campaign_end_date: "August 23",
      ask_for: "Bobby Lamb",
      alias_name: "Bobby Lamb",
      alias_1st_name: "Bobby",
      alias_position: "General Manager",
      kbb_ed: "August",
      event_coodinator: "Chris Closer, Jamie Greeter",
      campaign_theme: "DM108 / DM109",
    });
  });

  it("uses both months when a campaign crosses a calendar-month boundary", () => {
    const values = campaignCustomValues(
      { event_start: "2026-08-30", event_end: "2026-09-02", mailer: "DM110" },
      { alias: "Casey Dealer", alias_position: "Owner" }
    );

    expect(values.campaign_dates).toBe("August 30-September 2");
    expect(values.campaign_start_date).toBe("August 30");
    expect(values.campaign_end_date).toBe("September 2");
    expect(values.kbb_ed).toBe("August");
    expect(values.campaign_theme).toBe("DM110");
  });
});

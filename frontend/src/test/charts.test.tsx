import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartCard, DataTable, SeverityBadge } from "../components/ui";
import { seqColor, SEQ } from "../components/charts";

describe("chart building blocks", () => {
  it("ChartCard toggles between chart and table views", async () => {
    render(<ChartCard title="Alarms by age" chart={<div>chart-body</div>} table={<DataTable rows={[{ g: "<50", n: 3 }]} columns={[{ key: "g", label: "Group" }, { key: "n", label: "N", align: "right" }]} />} />);
    expect(screen.getByText("chart-body")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show Alarms by age as table" }));
    expect(screen.getByRole("columnheader", { name: "Group" })).toBeInTheDocument();
    expect(screen.queryByText("chart-body")).not.toBeInTheDocument();
  });

  it("sequential colour scale maps 0..max onto the ramp", () => {
    expect(seqColor(0, 10)).toBe(SEQ[0]);
    expect(seqColor(10, 10)).toBe(SEQ[SEQ.length - 1]);
    expect(seqColor(null, 10)).toBe("#f0efec");
  });

  it("severity badges carry a text label", () => {
    render(<><SeverityBadge severity="critical" /><SeverityBadge severity="advisory" /></>);
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Advisory")).toBeInTheDocument();
  });
});

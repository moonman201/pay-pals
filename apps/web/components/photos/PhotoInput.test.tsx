import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhotoInput } from "./PhotoInput";

describe("PhotoInput upload control", () => {
  it("hides the upload control when the host cannot store files", () => {
    render(<PhotoInput value={[]} onChange={() => {}} addedBy="seller" />);
    expect(screen.queryByText(/upload a file/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/local dev only/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add URL" })).toBeInTheDocument();
  });

  it("shows it, without dev copy, when the server says uploads work", () => {
    render(<PhotoInput value={[]} onChange={() => {}} addedBy="seller" uploadsEnabled />);
    expect(screen.getByText(/Or upload a file/)).toBeInTheDocument();
    expect(screen.queryByText(/local dev only/i)).not.toBeInTheDocument();
  });
});

import React from "react";
import { render, screen } from "@testing-library/react";
import SendPaymentForm from "../components/SendPaymentForm";

jest.mock("@/lib/stellar", () => ({
  buildPaymentTransaction: jest.fn(),
  buildSorobanTipTransaction: jest.fn(),
  CONTRACT_ID: null,
  explorerUrl: jest.fn((hash) => `https://expert.stellar.org/tx/${hash}`),
  isValidStellarAddress: jest.fn((addr) => addr.startsWith("G") && addr.length === 56),
  submitTransaction: jest.fn(),
  fetchNetworkFeeStats: jest.fn(() =>
    Promise.resolve({ baseFeeXlm: 0.00001, feeLevel: "normal" })
  ),
  truncateMemoText: jest.fn((text: string) => text),
  STELLAR_BASE_FEE_XLM: 0.00001,
  STELLAR_MEMO_TEXT_MAX_BYTES: 28,
}));

jest.mock("@/lib/wallet", () => ({
  signTransactionWithWallet: jest.fn(),
}));

jest.mock("@/utils/format", () => ({
  formatXLM: jest.fn((amount) => `${parseFloat(amount).toFixed(7)} XLM`),
}));

describe("SendPaymentForm", () => {
  const defaultProps = {
    publicKey: "GBRPYHIL2CI3WHZDTOOQFC6EB4RRJC3D5NZ2KMSUGSRNVO7ZFGIGSZ",
    xlmBalance: "100.0000000",
    usdcBalance: "50.0000000",
    onSuccess: jest.fn(),
  };

  it("renders the memo field and send button", async () => {
    render(<SendPaymentForm {...defaultProps} />);

    expect(screen.getByText("Memo (optional)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send/i })).toBeInTheDocument();
  });
});

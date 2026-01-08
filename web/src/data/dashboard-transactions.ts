// Where: Dashboard data used by the transaction table widget.
// What: Sample transactions for the data table component.
// Why: Keeps long mock data away from page layout code.
export type TransactionItem = {
  id: string
  avatar: string
  avatarFallback: string
  name: string
  email: string
  amount: number
  status: 'pending' | 'processing' | 'paid' | 'failed'
  paidBy: 'mastercard' | 'visa'
}

// Data is intentionally empty until live IC wiring is connected.
export const transactionData: TransactionItem[] = []

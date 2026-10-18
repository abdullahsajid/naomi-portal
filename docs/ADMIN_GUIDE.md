# Admin guide

For Naomi Katz Art. Go to **pay.naomikatzart.com/admin** and log in with the admin password.

## What customers do

1. They click **Buy by bank transfer** on an artwork in your store.
2. They enter their name, email and shipping address.
3. The artwork is **held for 15 minutes** (it disappears from the store so nobody else can buy it) and they see your bank details.
4. They transfer the money (in AUD) and upload a screenshot or PDF of the receipt.
5. Once the receipt is in, the artwork stays held **until you decide**. The 15 minutes only applies to uploading the receipt, not to the money arriving.

If no receipt is uploaded in 15 minutes, the artwork goes back on sale automatically and the customer gets an email.

## Reservations (the home page)

Every reservation, newest first. Filter by status:

| Status | Meaning |
|---|---|
| **active** | Customer is reserving; timer running ("Time left" column) |
| **receipt uploaded** | Receipt received, **waiting for you to check the payment** |
| **sold** | You confirmed the payment |
| **expired** | No receipt in time; artwork went back on sale |
| **released** | You cancelled it; artwork went back on sale |
| **failed** | Something went wrong while reserving; artwork was put back |

Click a reference (like **BT-ABC123**) to open it.

## Checking a payment

1. Open a reservation with status **receipt uploaded**. You'll get an email when one arrives.
2. Look at the receipt on the right (it opens large if you click it). Check the amount and the **reference** against your bank account.
3. Then choose:
   - **Mark as sold**: payment received. The customer gets a confirmation email. The artwork **stays hidden** on your store so it can't be sold again.
   - **Release**: payment didn't arrive or isn't right. The artwork goes back on sale.

You can add private **Admin notes** to any reservation.

## Stock

Lists all your artworks with price, quantity and whether they're **active** (for sale) or **hidden**.

- **Hide / Show** lets you take an artwork off the store or put it back by hand.
- Artworks with a live reservation show **Reserved (BT-…)** instead of a button. Manage those from the reservation, so the store and the portal never disagree.

Note: after **Mark as sold** an artwork stays *hidden*. Showing it as "sold" instead is something we can change if you prefer.

## Settings

- **Bank details** shown to customers after they reserve. Keep them up to date.
- **Discount** (default A$300) off the store price.
- **Artworks that offer bank transfer**: tick specific ones, or leave all unticked to offer it on every artwork.

## Alerts

If someone pays by **card** in your store for an artwork that is currently reserved by bank transfer, an alert appears here and you get an email. Decide which payment to honour and refund the other one (card refunds are done in your payment provider).

## Common questions

**A customer says they paid but the reservation expired.**
Check your bank account. If the money is there and the artwork is still on sale, ask the customer to reserve it again (it takes a minute) and mention the earlier transfer, or refund them. If someone else already reserved it, refund the first customer.

**The Reservations page shows "failed".**
The artwork was put back on sale; nothing to do. If you see lots of failures, tell your developer: it usually means the Big Cartel password changed.

**I changed my Big Cartel password.**
Tell your developer: the portal needs the new password or reservations will stop working.

**An artwork is hidden and I don't know why.**
Open **Reservations** and check for a live one for that artwork. If there's none, use **Stock → Show**.

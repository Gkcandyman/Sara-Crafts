Sara Crafts
===========

Full-stack Sara Crafts website with Node.js backend and MySQL storage.

Run the website:

1. Copy `.env.example` to `.env` and set your MySQL password.
2. Start MySQL from System Settings or with `/usr/local/mysql/support-files/mysql.server start`.
3. Run `npm start`.
4. Open `http://127.0.0.1:5000`.

To enable Google Pay / UPI QR payments, add the client UPI details to `.env`:

```
CLIENT_UPI_ID=client-upi-id@bank
CLIENT_PAYEE_NAME=Sara Crafts
```

The QR code uses this UPI ID, so scanning it from Google Pay or any UPI app pays directly to the client account. The site still keeps manual payment reference submission for confirmation.

The backend automatically creates the `sara_crafts` database and these tables:

- `orders`
- `appointments`
- `enquiries`
- `payments`

Website files live in `frontend/public/` and `frontend/src/`.

# ChatGPT Auto Import setup

This feature lets a configured ChatGPT custom GPT send a bill to the Shop Bill website. It does not make ordinary ChatGPT conversations control a browser directly.

## 1. Configure Upstash Redis

Create a Redis database in Upstash and copy its REST URL and REST token.

## 2. Add Vercel environment variables

In Vercel → Project → Settings → Environment Variables, add these for Production (and Preview if you test there):

- `UPSTASH_REDIS_REST_URL`: Upstash REST URL
- `UPSTASH_REDIS_REST_TOKEN`: Upstash REST token
- `BILL_IMPORT_API_KEY`: a long, random secret used by the ChatGPT Action
- `BILL_IMPORT_PIN`: a separate pairing PIN you will enter on the Shop Bill website
- `BILL_SESSION_SECRET`: a different long, random secret used to sign the website's secure session cookie

Generate separate secrets for each setting. Do not commit them to GitHub or put them in client-side code. Redeploy after adding them.

## 3. Pair the website

Open https://shop-bill-phi.vercel.app and choose **Connect Auto Import**. Enter the value of `BILL_IMPORT_PIN`. Keep the page open; it checks for incoming bills while connected. The pairing cookie is HttpOnly and is not exposed to browser JavaScript.

## 4. Configure a ChatGPT custom GPT Action

In the GPT editor, add an Action and import the OpenAPI schema from `openapi/shop-bill-action.yaml` (or paste its contents). Set Authentication to **API Key**, choose **Bearer**, and enter the exact value of `BILL_IMPORT_API_KEY`.

In the GPT's instructions, add:

> When the user asks to send/import a bill to Shop Bill, call importShopBill with every item. Use numeric quantity, the item's unit, and the line total as price. Do not call the action until the user asks to send the bill. Confirm the number of items and total in the response.

Save the GPT and test it by asking it to send a small sample bill. The Action is available in that configured GPT; it is not automatically available in every regular ChatGPT conversation.

## Notes

- The queue holds one pending bill at a time; a new import replaces an unclaimed one.
- Pending bills expire after 24 hours.
- Keep the Shop Bill tab open and connected when sending a bill.
- The browser still lets you edit the imported items before saving/sharing.

# How to put your four websites online for free

When you're done you will have four live links, for example `https://urgent2k.onrender.com`, that anyone can click from your CV. It takes about 30–40 minutes and **no bank card is needed**.

You will use two free services:

- **Aiven** holds the database: the products, users, bookings and meal codes. One free MySQL database is enough for all four sites.
- **Render** runs the websites themselves. It reads the `render.yaml` file in your repository and sets up all four sites in one go.

> **Before you start:** run `bash publish-to-github.sh` first so the newest version of the code is on GitHub.

---

## Part 1: Create the free database (Aiven)

1. Go to **https://aiven.io/free-mysql-database** and click **Get started for free**. Sign up with Google or your email.
2. Click **Create service**, then choose **MySQL**.
3. Choose the **Free plan**. Pick any cloud region; one in Europe is closest to Nigeria.
4. Name the service `portfolio-db` and click **Create service**. Wait a few minutes until the status turns green and says **Running**.
5. Open the service. On the **Overview** page, find **Connection information** and copy these four items into a note (Notepad is fine):
   - **Host**, which looks like `portfolio-db-yourname.aivencloud.com`
   - **Port**, a number such as `12345`. It is usually **not** 3306.
   - **User**, which is `avnadmin`
   - **Password**. Click the eye icon to reveal it, then copy it.

Keep this note private. The password gives full control of your database.

---

## Part 2: Create the four websites (Render)

1. Go to **https://render.com** and click **Get started**. Choose **Sign up with GitHub**; this lets Render see your repositories.
2. In the Render dashboard, click **New +** (top right), then **Blueprint**.
3. Choose the **web-development-portfolio** repository. If you can't see it, click **Configure account** and give Render access to it.
4. Render reads `render.yaml` and lists **4 services** (foodstuff-store, urgent2k, spindrop and chowpass) and **1 environment group** (aiven-mysql).
   - Give the Blueprint a name such as `portfolio`.
   - Click **Deploy Blueprint** (it may say **Apply**).
5. Wait for the first build to finish. The sites **won't work yet** because they don't know your database details. That's expected.

## Part 3: Connect the websites to the database

1. In Render's left menu, click **Environment Groups**, then **aiven-mysql**.
2. Replace the placeholder values with the details from your Aiven note:

   | Key | What to put |
   |---|---|
   | `DB_HOST` | your Aiven **Host** |
   | `DB_PORT` | your Aiven **Port** (the number, e.g. 12345) |
   | `DB_USER` | `avnadmin` |
   | `DB_PASSWORD` | your Aiven **Password** |

   Leave the other keys as they are.
3. Click **Save changes**.
4. Go back to the **Dashboard**. For each of the four services, click the service, then **Manual Deploy**, then **Deploy latest commit**. You can start all four at once; each takes about 2–5 minutes.

On first start, each website creates its own database on your Aiven server and fills it with the demo data.

## Part 4: Check that each site works

For each service, Render shows its link near the top, e.g. `https://chowpass.onrender.com`. If a name was taken, Render adds a few letters, so copy the link Render gives you.

1. Open the link with `/api/health` added to the end, e.g. `https://chowpass.onrender.com/api/health`.
   - `"database":"connected"` means everything is working. 🎉
   - `"database":"not connected"` means a database detail is wrong. Check the Host, Port and Password in Part 3, save, and redeploy.
2. Open the main link and log in with a demo account (the password for every account is `Password123!`):
   - **Urgent2k:** `ada@demo.ng` (customer) or `emeka@demo.ng` (tasker)
   - **SpinDrop:** `ada@demo.ng` (customer), `musa@demo.ng` (rider) or `admin@spindrop.ng` (admin)
   - **ChowPass:** `ada@demo.ng` (staff), `kitchen@demo.ng` (restaurant), `hr@demo.ng` (HR) or `admin@chowpass.ng` (operations)
   - **Foodstuff Store:** no login needed; just shop and check out.

## Part 5: Show the links off

1. Send me the four links and I'll add them to the READMEs (replacing "coming soon") and to your Software Developer CV. Then run `bash publish-to-github.sh` again.
2. Add the best one or two to your LinkedIn **Featured** section.

---

## Good to know

- **Free sites fall asleep.** After 15 minutes with no visitors, a free Render site goes to sleep. The next visitor waits **about a minute** while it wakes up, then it's fast again. Before an interview, open your links a few minutes early so they're awake. In applications you can write: *"Live demo (free hosting, may take up to a minute to wake up)."*
- **Free hours:** Render gives 750 free hours a month across your account. That's plenty, because sleeping sites don't use hours.
- **The database can pause too.** Aiven may power off a free database that hasn't been used for a long time and will email you first. If that happens, log in to Aiven and click **Power on**.
- **Code changes go live automatically.** When you push changes to GitHub, Render rebuilds the sites by itself.
- **Everyone shares the demo data**, so visitors may see each other's test orders. That's normal for a portfolio demo.

## Sources

- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Aiven free MySQL database](https://aiven.io/free-mysql-database)
- [Is Render free? (free tier limits explained)](https://justinmckelvey.com/blog/is-render-free)
- [Render: platforms with a real free tier for developers](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026)

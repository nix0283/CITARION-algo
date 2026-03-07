# First Entry as Market

**URL:** https://help.cornix.io/en/articles/5814856-first-entry-as-market

**Created:** 2026-03-03T11:48:04+00:00

---

First Entry as Market | Cornix Help Center- - - - - - :root{--body-bg: rgb(255, 255, 255);
--body-image: none;
--body-bg-rgb: 255, 255, 255;
--body-border: rgb(230, 230, 230);
--body-primary-color: #1a1a1a;
--body-secondary-color: #737373;
--body-reaction-bg: rgb(242, 242, 242);
--body-reaction-text-color: rgb(64, 64, 64);
--body-toc-active-border: #737373;
--body-toc-inactive-border: #f2f2f2;
--body-toc-inactive-color: #737373;
--body-toc-active-font-weight: 400;
--body-table-border: rgb(204, 204, 204);
--body-color: hsl(0, 0%, 0%);
--footer-bg: rgb(255, 255, 255);
--footer-image: none;
--footer-border: rgb(230, 230, 230);
--footer-color: hsl(211, 10%, 61%);
--header-bg: none;
--header-image: url(https://downloads.intercomcdn.com/i/o/wrsw0nb0/663084/8cd5c29e4b01ccfff3d54c7bd01a/bcb02057784c6c6a633cd138e02ffe33.jpg);
--header-color: hsl(242, 64%, 18%);
--collection-card-bg: rgb(242, 242, 255);
--collection-card-image: none;
--collection-card-color: hsl(201, 97%, 41%);
--card-bg: rgb(255, 255, 255);
--card-border-color: rgb(230, 230, 230);
--card-border-inner-radius: 8px;
--card-border-radius: 10px;
--card-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--search-bar-border-radius: 10px;
--search-bar-width: 100%;
--ticket-blue-bg-color: #dce1f9;
--ticket-blue-text-color: #334bfa;
--ticket-green-bg-color: #d7efdc;
--ticket-green-text-color: #0f7134;
--ticket-orange-bg-color: #ffebdb;
--ticket-orange-text-color: #b24d00;
--ticket-red-bg-color: #ffdbdb;
--ticket-red-text-color: #df2020;
--header-height: 245px;
--header-subheader-background-color: #000000;
--header-subheader-font-color: #FFFFFF;
--content-block-bg: rgb(255, 255, 255);
--content-block-image: none;
--content-block-color: hsl(0, 0%, 10%);
--content-block-button-bg: rgb(51, 75, 250);
--content-block-button-image: none;
--content-block-button-color: hsl(0, 0%, 100%);
--content-block-button-radius: 6px;
--content-block-margin: 0;
--content-block-width: auto;
--primary-color: hsl(242, 64%, 18%);
--primary-color-alpha-10: hsla(242, 64%, 18%, 0.1);
--primary-color-alpha-60: hsla(242, 64%, 18%, 0.6);
--text-on-primary-color: #ffffff}Skip to main content
DashboardAnnouncements ChannelEnglish
English
DashboardAnnouncements ChannelEnglish
English
Search for articles...
Table of contents
What is it trying to solve?How does it work?Example for "Entry Price Reached"- All Collections
- Trading Configurations
- Trading Configuration - Entries
- First Entry as Market
# First Entry as Market
The upgraded feature known before as First Entry Grace
Written by Hadar Cornix Updated over a year agoTable of contents
What is it trying to solve?How does it work?Example for "Entry Price Reached"
The "First Entry as Market" feature will help you miss fewer trades by allowing you to define a percentage by which to extend the first entry price range, making it more likely that your entry will be filled and you'll enter the trade.

This setting can be found and set here:
Signals Bots > My Bots > Create/ Edit > Entries > First Entry as Market > Personal


## What is it trying to solve?
When trading automatically, you might experience cases where you might "miss" potential trades, when the first entry target remains unfilled even though the signal entry target was reached.
A couple of cases where this might happen (assuming long signals) are:

-
The signal was created when the symbol price was below the first entry price, but immediately as it was published many users entered the signal causing the price to increase again until it is above the first entry price.
In that case, it's possible that the price increased before some users were able to place the orders in the exchange and therefore, if the price does not fall back into the entry range, they might miss the trade.
-
The signal was created when the price was outside the entry price range and all the users that entered the signal end up creating a "buy-wall" which causes the price to hover around the first entry price but never cross it.
In that case, many users have entry orders at the same price and some might end up getting filled while others might be left unfilled before the price starts to increase again and move away from the entry price.
Both cases are especially common where the signal is posted on a symbol with low-liquidity, where a relatively small trading volume can significantly affect price movement (and create walls in the order book).

The purpose of the "First Entry as Market" feature, is to help you avoid cases like the ones mentioned above, where the signal's entry price is reached (or crossed) but your trade's orders remain unfilled.


## How does it work?
First, you'll have to choose the "Maximum Price Cap (%)", this will determine the percentage in which the bot will extend the first entry price.
The default is 1%, and you can choose any percentage between 0.05%-20%.

Then, choose when to activate the feature
​
-
Activate when "Entry Price Reached" will use the first entry target price as a trigger. It will wait for the entry price to be reached or crossed on the exchange, and only then will activate the percentage range for the entry price.
In this case, Cornix will only apply the percentage range to the trade's first entry once at least one entry target is reached in the signal. This means that the "First Entry as Market" will not help you in cases where the signal price never reached the entry price range.
​
-
Activate "Immediately" will create this range immediately when the trade is opened, without waiting for any trigger, or for the entry target of the signal to be reached.

In both cases, when activated, Cornix will iteratively increase the first entry target price by small intervals until the order is filled, or until the maximum price as defined by the % value is reached (that maximum price will be equal to the original entry price + the set percentage). After reaching that maximum order price including the grace, Cornix will stop updating the order price and the order will remain open in the exchange until it is filled or canceled (just like any other regular order).

In effect, using this feature will allow you to extend the potential entry price range making it less likely to miss trades that reached at least one entry target.


# Example for "Entry Price Reached"
Let's take the following long signal of ADA/BTC:

Figure 1: Example of signal

Assuming the signal was created when the price of ADA/BTC was 0.00002200.
In this case, as long as the price stays above the first entry price (0.00002000) the "First Entry as Market %" parameter does not take effect and will not modify the trade in any way.

Now, let's assume the price of ADA/BTC decreases until it reaches exactly the first entry price at 0.00002000 before going up again and reaching the first Take-Profit target at 0.00003000. In this case, let's consider what would happen when the percentage is set and when it's not set in your trading configuration:

-
First Entry as Market % is not set - In this case, your trade will have a simple limit order placed at the first entry target price of 0.00002000. Since the price dropped exactly to the first entry price before going up again, it's very possible that your order will remain unfilled depending on its location in the order book.
-
First Entry as Market % parameter is set to 2% - In this case, the trade will also be created with a regular limit order, however when the signal entry price is reached Cornix will activate the % range if the order is not yet filled. Since the % is set, Cornix will continuously attempt to increase the order price little by little until the order is filled or the maximum price including the percentage. In this case, since the percentage is set to 2% the maximum order price Cornix will use is 0.00002040, which is 2% above the original price (1.02 * 0.00002000 = 0.00002040).
Please note that both examples assumed the trades were created without trailing entry. When trailing entry is used, this parameter will be ignored and will not affect the trade behavior.

On this following video tutorial you can see a visual explanation of the second option, with activation when the price is reached.


Did this answer your question?😞😐😃Cornix Help Center-
-
-
-
Intercom
We run on Intercom
window.intercomSettings = {"app_id":"wrsw0nb0","article_id":"5814856","anonymous_id":"92445c65-3bd8-4dc9-9844-34af72570b14"};
(function(){var w=window;var ic=w.Intercom;if(typeof ic==="function"){ic('reattach_activator');ic('update',w.intercomSettings);}else{var d=document;var i=function(){i.c(arguments);};i.q=[];i.c=function(args){i.q.push(args);};w.Intercom=i;var l=function(){var s=d.createElement('script');s.type='text/javascript';s.async=true;s.src='https://widget.intercom.io/widget/wrsw0nb0';var x=d.getElementsByTagName('script')[0];x.parentNode.insertBefore(s, x);};if(document.readyState==='complete'){l();}else if(w.attachEvent){w.attachEvent('onload',l);}else{w.addEventListener('load',l,false);}}})();

@keyframes intercom-lightweight-app-launcher {
from {
opacity: 0;
transform: scale(0.5);
}
to {
opacity: 1;
transform: scale(1);
}
}
@keyframes intercom-lightweight-app-gradient {
from {
opacity: 0;
}
to {
opacity: 1;
}
}
@keyframes intercom-lightweight-app-messenger {
0% {
opacity: 0;
transform: scale(0);
}
40% {
opacity: 1;
}
100% {
transform: scale(1);
}
}
.intercom-lightweight-app {
position: fixed;
z-index: 2147483001;
width: 0;
height: 0;
font-family: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
}
.intercom-lightweight-app-gradient {
position: fixed;
z-index: 2147483002;
width: 500px;
height: 500px;
bottom: 0;
right: 0;
pointer-events: none;
background: radial-gradient(
ellipse at bottom right,
rgba(29, 39, 54, 0.16) 0%,
rgba(29, 39, 54, 0) 72%);
animation: intercom-lightweight-app-gradient 200ms ease-out;
}
.intercom-lightweight-app-launcher {
position: fixed;
z-index: 2147483003;
padding: 0 !important;
margin: 0 !important;
border: none;
bottom: 20px;
right: 20px;
max-width: 48px;
width: 48px;
max-height: 48px;
height: 48px;
border-radius: 50%;
background: #0071b2;
cursor: pointer;
box-shadow: 0 1px 6px 0 rgba(0, 0, 0, 0.06), 0 2px 32px 0 rgba(0, 0, 0, 0.16);
transition: transform 167ms cubic-bezier(0.33, 0.00, 0.00, 1.00);
box-sizing: content-box;
}
.intercom-lightweight-app-launcher:hover {
transition: transform 250ms cubic-bezier(0.33, 0.00, 0.00, 1.00);
transform: scale(1.1)
}
.intercom-lightweight-app-launcher:active {
transform: scale(0.85);
transition: transform 134ms cubic-bezier(0.45, 0, 0.2, 1);
}
.intercom-lightweight-app-launcher:focus {
outline: none;

}
.intercom-lightweight-app-launcher-icon {
display: flex;
align-items: center;
justify-content: center;
position: absolute;
top: 0;
left: 0;
width: 48px;
height: 48px;
transition: transform 100ms linear, opacity 80ms linear;
}
.intercom-lightweight-app-launcher-icon-open {

opacity: 1;
transform: rotate(0deg) scale(1);

}
.intercom-lightweight-app-launcher-icon-open svg {
width: 24px;
height: 24px;
}
.intercom-lightweight-app-launcher-icon-open svg path {
fill: rgb(255, 255, 255);
}
.intercom-lightweight-app-launcher-icon-self-serve {

opacity: 1;
transform: rotate(0deg) scale(1);

}
.intercom-lightweight-app-launcher-icon-self-serve svg {
height: 44px;
}
.intercom-lightweight-app-launcher-icon-self-serve svg path {
fill: rgb(255, 255, 255);
}
.intercom-lightweight-app-launcher-custom-icon-open {
max-height: 24px;
max-width: 24px;

opacity: 1;
transform: rotate(0deg) scale(1);

}
.intercom-lightweight-app-launcher-icon-minimize {

opacity: 0;
transform: rotate(-60deg) scale(0);

}
.intercom-lightweight-app-launcher-icon-minimize svg path {
fill: rgb(255, 255, 255);
}
/* Extended launcher styles */
.intercom-lightweight-app-launcher.intercom-launcher-extended {
width: calc(180px - 30px);
max-width: calc(180px - 30px);
height: calc(45px - 26px);
max-height: calc(45px - 26px);
border-radius: 12px;
display: flex;
align-items: center;
justify-content: flex-start;
padding: 12px 16px 12px 12px !important;
gap: 6px;
/* Use theme background instead of hardcoded gradient */
background: #0071b2;
border: 1px solid rgba(255, 255, 255, 0.15);
box-shadow: 0px -2px 50px rgba(0, 0, 0, 0.1);

}
.intercom-lightweight-app-launcher.intercom-launcher-extended .intercom-lightweight-app-launcher-icon {
position: relative;
width: 24px;
height: 24px;
}
.intercom-lightweight-app-launcher-text {
/* Match text color with launcher icon */
color: rgb(255, 255, 255);
font-size: 14px;
font-weight: 600;
line-height: 1.5;
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
max-width: 140px;
opacity: 1;
transition: opacity 80ms linear;
}
.intercom-lightweight-app-messenger {
position: fixed;
z-index: 2147483003;
overflow: hidden;
background-color: #ffffff;
animation: intercom-lightweight-app-messenger 250ms cubic-bezier(0, 1, 1, 1);
transform-origin: bottom right;

width: 400px;
height: calc(100% - 104px);
max-height: 704px;
min-height: 250px;
right: 20px;
bottom: 84px;
box-shadow: 0 5px 40px rgba(0,0,0,0.16);

border-radius: 24px;
}
.intercom-lightweight-app-messenger-header {
height: 64px;
border-bottom: none;
background: #ffffff;
}
.intercom-lightweight-app-messenger-footer{
position:absolute;
bottom:0;
width: 100%;
height: 80px;
background: #ffffff;
font-size: 14px;
line-height: 21px;
border-top: 1px solid rgba(0, 0, 0, 0.05);
box-shadow: 0px 0px 25px rgba(0, 0, 0, 0.05);
}
@media print {
.intercom-lightweight-app {
display: none;
}
}
\n\n---\n\n## Изображения\n\n### Изображение 1\n\n<!-- Image description: The Cornix trading bot interface shows the "Edit Signals Bot" screen with the "Entries" tab active, displaying settings like "First Entry as Market" (highlighted by an arrow), "Entries Ratios," and "Leveraged Trailing." The left sidebar includes navigation (e.g., "My Bots" selected), while the right panel shows balance info, "Basic Settings"/"Backtesting" buttons, and a "Most Traded Pairs" section. Top tabs (General, Entries, Take-Profits) and currency pairs (BTC/USDT, ETH/USDT) are visible, with a dark blue theme. -->
<!-- Image description: The screenshot shows a dark-themed Cornix trading bot interface with UI elements for bot configuration. Key elements include a toggle for "First Entry as Market" (set to "Personal"), a dropdown for "Maximum Price Cap (%)" (set to 1%), and a "When to Activate" section with two radio buttons: "Entry Price Reached" (selected) and "Immediately." Blue arrows highlight the "When to Activate" section, emphasizing activation conditions. -->
<!-- Image description: The screenshot displays a Cornix trading bot interface for the ADA/BTC pair on Binance, showing a "Regular (Long)" signal. It lists entry targets (0.00002000, 0.00001900, 0.00001800), take-profit targets (0.00003000, 0.00003100, 0.00003200), and a stop target (0.00001600). At the bottom, there are two buttons: "One Click Follow" (with stars) and "Follow Signal" (with arrows), plus a timestamp (7:17 AM) and a "3" indicator in the top-right. -->
![Image 1](https://cornix.intercom-attachments-1.com/i/o/434792216/623b0b70df96e083444fb6b5/signal.png?expires=1772540100&amp;signature=8779ee06e991d6ef6798a5c269df4de99474d985755fa6c1e5cc27cd78b1594a&amp;req=cCMjEcB8n4BZFb4f3HP0gOHokPILB27y%2FBiQYO7e%2BvH5Ab%2BSn9Nc0BqMXra1%0AOPqbVGB4MVHZ2yKvOg%3D%3D%0A)\n\n**URL:** https://cornix.intercom-attachments-1.com/i/o/434792216/623b0b70df96e083444fb6b5/signal.png?expires=1772540100&amp;signature=8779ee06e991d6ef6798a5c269df4de99474d985755fa6c1e5cc27cd78b1594a&amp;req=cCMjEcB8n4BZFb4f3HP0gOHokPILB27y%2FBiQYO7e%2BvH5Ab%2BSn9Nc0BqMXra1%0AOPqbVGB4MVHZ2yKvOg%3D%3D%0A\n\n**Описание:** The screenshot displays a Cornix trading bot interface for the ADA/BTC pair on Binance, showing a "Regular (Long)" signal with entry, take-profit, and stop targets. UI elements include the trading pair and exchange at the top, labeled target lists (entry, take-profit, stop), and two action buttons—"One Click Follow" and "Follow Signal"—at the bottom, with a timestamp (7:17 AM) and notification icon in the corner.\n\n---\n\n### Изображение 2\n\n![Image 2](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1256202092/b539e034aadae01ff7d7c99cf9ad/image.png?expires=1772540100&amp;signature=8f20774fc6776211cfddda9226dedde7b40e8233f19b5d4a508b26465b4c99de&amp;req=dSIiEMt%2Bn4FWW%2FMW1HO4zbvL%2BiyEEg5Z0JEnYcgwuuNVJPlcfPj44je0i%2Bzl%0AgE0Fb%2Figw8MhXUujDaM%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1256202092/b539e034aadae01ff7d7c99cf9ad/image.png?expires=1772540100&amp;signature=8f20774fc6776211cfddda9226dedde7b40e8233f19b5d4a508b26465b4c99de&amp;req=dSIiEMt%2Bn4FWW%2FMW1HO4zbvL%2BiyEEg5Z0JEnYcgwuuNVJPlcfPj44je0i%2Bzl%0AgE0Fb%2Figw8MhXUujDaM%3D%0A\n\n**Описание:** The Cornix trading bot interface shows the "Edit Signals Bot" page with the "Entries" tab active, displaying configuration options like "Entries Ratios," "Entries Prices," and "First Entry as Market" (highlighted by a blue arrow). The left sidebar includes navigation for "My Bots" (selected) and other trading sections, while the right panel shows balance details, "Save Changes" button, and "Most Traded Pairs" with no recent signals. Top tabs for "Live Trading" and "Demo" are visible, along with cryptocurrency price tickers.\n\n---\n\n### Изображение 3\n\n![Image 3](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1256315756/1bac55e83902a183df66387be9dd/image.png?expires=1772540100&amp;signature=20b7e76d39f293661325986253a5d0ed3aedf79d4ec093ca19e0f3a1d9beee5e&amp;req=dSIiEMp%2FmIZaX%2FMW1HO4zSHZAmwN5m8ZCPFqiyrwBotM8VEq9G4s5E5koDMI%0AXMJfy47hCPYyEzbInOQ%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1256315756/1bac55e83902a183df66387be9dd/image.png?expires=1772540100&amp;signature=20b7e76d39f293661325986253a5d0ed3aedf79d4ec093ca19e0f3a1d9beee5e&amp;req=dSIiEMp%2FmIZaX%2FMW1HO4zSHZAmwN5m8ZCPFqiyrwBotM8VEq9G4s5E5koDMI%0AXMJfy47hCPYyEzbInOQ%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot interface with a dark blue background. Key UI elements include a toggle for "First Entry as Market" (set to "Personal"), a dropdown for "Maximum Price Cap (%)" (defaulting to 1%), and a "When to Activate" section with two radio buttons: "Entry Price Reached" (selected) and "Immediately." Large blue arrows point to the "Entry Price Reached" option, emphasizing its selection.\n\n---\n\n### Изображение 4\n\n![Image 4](https://downloads.intercomcdn.com/i/o/wrsw0nb0/663085/66f657d34c477c0cb5e0ad55a357/811b89d422741a7d1e34bcfcff4f39f0.png)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/663085/66f657d34c477c0cb5e0ad55a357/811b89d422741a7d1e34bcfcff4f39f0.png\n\n**Описание:** The screenshot displays the Cornix trading bot’s logo, featuring a stylized dark blue crow (or raven) with a yellow beak, perched on a curved line above the brand name “cornix” in bold, dark blue lowercase letters. The design is clean and minimalistic, with the bird and text centered against a white background, emphasizing the brand’s visual identity.\n\n---\n\n### Изображение 5\n\n![Image 5](https://static.intercomassets.com/avatars/5322994/square_128/IMG-20230206-WA0000_%281%29-1678375300.jpeg)\n\n**URL:** https://static.intercomassets.com/avatars/5322994/square_128/IMG-20230206-WA0000_%281%29-1678375300.jpeg\n\n**Описание:** The screenshot shows a Cornix trading bot interface with a clean, modern design. Key UI elements include a navigation bar at the top (likely with tabs like "Dashboard," "Bots," "Settings"), a central panel displaying bot configuration options (e.g., trading pairs, risk settings, timeframes), and a sidebar with quick-access tools or account info. The layout emphasizes clarity, with distinct sections for bot management and real-time trading data.\n\n---\n\n

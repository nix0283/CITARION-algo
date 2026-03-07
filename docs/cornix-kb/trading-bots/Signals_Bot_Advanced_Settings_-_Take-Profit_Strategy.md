# Signals Bot Advanced Settings - Take-Profit Strategy

**URL:** https://help.cornix.io/en/articles/8976604-signals-bot-advanced-settings-take-profit-strategy

**Created:** 2026-03-03T11:47:14+00:00

---

Signals Bot Advanced Settings - Take-Profit Strategy | Cornix Help Center- - - - - - :root{--body-bg: rgb(255, 255, 255);
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
Channel vs. Personal'Channel''Personal''Only use if not defined by group'Take-Profits RatiosBuilt-inCustomDCAFirst Take-Profit DistanceTake-Profits PricesMax Number of OrdersTrailingMoving Take-Profits- All Collections
- Trading Bots
- Signals
- Signals Bots Advanced Settings
- Signals Bot Advanced Settings - Take-Profit Strategy
# Signals Bot Advanced Settings - Take-Profit Strategy
How to set your own Take Profit strategy to override the signals channel settings
Written by Hadar Cornix Updated over 3 months agoTable of contents
Channel vs. Personal'Channel''Personal''Only use if not defined by group'Take-Profits RatiosBuilt-inCustomDCAFirst Take-Profit DistanceTake-Profits PricesMax Number of OrdersTrailingMoving Take-Profits
# Channel vs. Personal
## 'Channel'
Leaving a value with the 'Channel' toggle enabled will adopt the signal's configuration and the channel settings.

## 'Personal'
By choosing the 'Personal' option you can set your own take-profit orders ratios, prices, the max number of orders, trailing take-profit preferences, enable the Moving Take-Profits feature, and set Take Profit Grace.

## 'Only use if not defined by group'
Selecting the "Only use if not defined by group" checkbox will enable the chosen take-profit configuration to be used as a fallback only when the ratios are not specified in the posted signal or group configuration. If the parameter is defined in the signal or group configuration, the bot will use the value defined by the signal or the group configuration.

# Take-Profits Ratios

## Built-in
-
### Evenly Divided
Evenly allocates the trade amount among multiple take-profit targets, ensuring an equal distribution of funds, such as placing 25% in each of the four entry targets in a trade with four targets.

-
### Decreasing Exponential
Starting with the lowest-priced take-profit target, each subsequent target receives half the amount of the previous one, creating a descending distribution. For example, in a trade with 4 take-profit targets, the first target gets 53.333% of the trade amount, the second gets 26.666%, the third obtain 13.333%, and the last, with the lowest price, gets 6.666%, maintaining a total sum of 100%.

-
### Increasing Exponential
Starting with the lowest-priced take-profit target, each subsequent target receives twice the amount of the previous one, creating an ascending distribution. For example, with 4 take-profit targets, the first target gets 6.666% of the trade amount, the second receives 13.333% (double the amount of the previous target), the third obtains 26.666%, and the last, with the lowest price, gets 53.333%, ensuring a total sum of 100%.
## Custom
In the custom strategy, you can personally design how the trade amount is distributed among take-profit targets, tailoring the allocation to align with your specific preferences and trading approach.

## DCA
### Amount Scale
Determines the multiplier between each following Take Profit order amount and will set the ratio between the orders, in terms of the amount invested in every order.
For example, for an amount scale of 2 if the total trade amount is $70 and the number of orders is 3, then the orders amounts will be $10, $20, and $40 respectively.

# First Take-Profit Distance
The percentage away from the trade's first entry order, in which the bot will place the first take profit order.
*Based on the first entry order of the trade itself.

# Take-Profits Prices
The 'Price Difference' and 'Price Scale' parameters play a crucial role in determining the orders' prices:

-
## Price Difference
This parameter establishes the variance between the first and second take-profit order. The second take-profit order's price is set to be the first take-profit price plus the percentage specified as the price difference.
For example, If the first take-profit price is 100 and the price difference is 1%, the three initial take-profit orders will be placed at 100, 101 (100 + 100*1%), and 102.01 (101 + 101*1%).
-
## Price Scale
This parameter sets the price difference multiplier from the second take-profit order onward. It influences subsequent orders' prices.
For example, If the first take-profit price is 100, the price difference is 1%, and the price scale is 2, the three initial take-profit orders will be placed at 100, 101 (100 + 100*1%), and 103.02 (101 + 101*1%*2).

# Max Number of Orders
Will determine the maximum number of potential take-profit orders the bot will place in each trade (up to 10 take-profit orders).

# Trailing
The advanced trailing configuration allows you to set a conditional order that moves and follows the market price after the trigger price is reached. You can either leave it off, at the channel's discretion, or by setting the trailing percentage as your own.

If enabled, when a take profit order reaches the order price, instead of executing the take profit order as a regular limit order, the bot will create a trailing order that trails below the maximum price that is reached by the specified percentage. The coins will be sold once the coin's price decreases to the trailing price.

In some cases, the next take profit target can be reached while a trailing take profit order is already active. When this happens, instead of creating a new trailing take profit order, the bot will merge the amount that should have been purchased in the new target with the existing trailing take profit order. Learn more about trailing.

*In the case of Futures trades with leverage, the trailing percentage parameters will be adjusted (divided) by the trade’s leverage multiplier to keep the same effective percentage. The adjustment has a minimum threshold of 0.2%.
​Learn more about Automated Configuration Leverage Adjustment.

# Moving Take-Profits
When you set your Moving Take Profits, you can choose one of two baseline options:
-
First Entry
-
Average Entries
-
## First Entry Baseline
If your goal is to keep the same original distance between your Entries and Take Profits, this baseline will let you shift your Take-Profits based on the actual execution price of your first entry target.

When is this useful?
For example, if you’ve set a grace for your first entry ("First Entry as Market") and your entry was executed 5% above the original entry price, your Take-Profits will move higher accordingly - reflecting your actual entry execution price.

Let's review this trade as an example:

Entry 1: 100
Entry 2: 90
Entry 3: 80

Take Profit 1: 110
Take Profit 2: 120

The original distance between the first Take Profit to the Entry price was 10%.
The original distance between the second Take Profit to the Entry price was 20%.
Let's assume that eventually the first entry order was executed at the price of 105,
so that the entry targets look like this:
Entry 1: 105 ✅
Entry 2: 90
Entry 3: 80

The new First Entry is now 105, and the Take Profits will move up keeping the same original distance:
Take Profit 1: 105*1.1 = 115.5
Take Profit 2: 105*1.2 = 126
-
## Average Entries Baseline
To increase the chances of hitting a take profit target, the bot will adjust the take profit targets on every entry that gets filled. It will keep the same initial distance between the take profits and the first entry from the average entries on every entry that gets filled.

Let's review this trade as an example:

Entry 1: 100
Entry 2: 90
Entry 3: 80

Take Profit 1: 110
Take Profit 2: 120

The initial distance between the first take profit and the first entry is 10%.
The initial distance between the second take profit and the first entry is 20%.
With each entry that gets filled, the bot will move the take profits accordingly, to keep the 10% and 20% distance from the average entry price, meaning the trade will look like this:

Entry 1: 100 ✅
Entry 2: 90 ✅
Entry 3: 80

Current Actual Average Entry Price: 95

Adjusted Take Profit Targets:
Take Profit 1: 95*1.1 = 104.5
Take Profit 2: 95*1.2 = 114
##
Did this answer your question?😞😐😃Cornix Help Center-
-
-
-
Intercom
We run on Intercom
window.intercomSettings = {"app_id":"wrsw0nb0","article_id":"8976604","anonymous_id":"a0c9cb78-5f13-4c60-9ce0-198ad87d09e2"};
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
\n\n---\n\n## Изображения\n\n### Изображение 1\n\n![Image 1](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1338255558/1435c0ae22036e0f28559dc0cbf2/image.png?expires=1772540100&amp;signature=18768d3123c3582c8741fb75bc99ddea1c448275e2e4536313a7b5677ba590ca&amp;req=dSMkHst7mIRaUfMW1HO4zUU35PGEP7hxbrS9XcvnsEMzBOAFaggD4GM15LUk%0Ag%2BNTvHDLt4moAq0965I%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1338255558/1435c0ae22036e0f28559dc0cbf2/image.png?expires=1772540100&amp;signature=18768d3123c3582c8741fb75bc99ddea1c448275e2e4536313a7b5677ba590ca&amp;req=dSMkHst7mIRaUfMW1HO4zUU35PGEP7hxbrS9XcvnsEMzBOAFaggD4GM15LUk%0Ag%2BNTvHDLt4moAq0965I%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot UI with a "Moving Take-Profits" toggle (set to "On") and a "Price Adjustment Baseline" dropdown. The dropdown is expanded, displaying two options—"First Entry" (selected) and "Average Entries"—with blue arrows pointing to the dropdown and its selected item.\n\n---\n\n### Изображение 2\n\n![Image 2](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885296401/76b5a65cb0a424ffb90b8a6da3c6/image.png?expires=1772540100&amp;signature=f6544b3406312ebbeb5e22754180832ea2d67a0aa16404913956640e6a2a7eae&amp;req=dSgvE8t3m4VfWPMW1HO4zVSjzXoPIldSOWxA9Stgffnj%2F1jXOhImPJq07cnn%0As0tSKVDKSN4XDVYPZZA%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885296401/76b5a65cb0a424ffb90b8a6da3c6/image.png?expires=1772540100&amp;signature=f6544b3406312ebbeb5e22754180832ea2d67a0aa16404913956640e6a2a7eae&amp;req=dSgvE8t3m4VfWPMW1HO4zVSjzXoPIldSOWxA9Stgffnj%2F1jXOhImPJq07cnn%0As0tSKVDKSN4XDVYPZZA%3D%0A\n\n**Описание:** The screenshot shows the "Take-Profits" tab of the Cornix trading bot UI, with a top navigation bar including tabs like General, Entries, Take-Profits, Stop, and Advanced. Below, there’s a "Take-Profits Ratios" section with an info icon, a "Channel" label, and a blue "Personal" button. Under that, three tabs—"Built-in" (selected), "Custom", "DCA"—are visible, followed by a dropdown menu labeled "Evenly Divided" and a checkbox for "Only use if not defined by group" with an info icon.\n\n---\n\n### Изображение 3\n\n![Image 3](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885302164/8d53f5ea764af942ac8c82a1d379/image.png?expires=1772540100&amp;signature=936cb467aa8262b8fa463c3fbb389fe68ab20acb7720e8e0e2d1dd84ea5ce690&amp;req=dSgvE8p%2Bn4BZXfMW1HO4zbcdX%2F0sEXI2%2BwEYwydYdHKyRYlrJ%2F6gbB6ewFBr%0AZyguTL1YACzdanYz%2FbA%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885302164/8d53f5ea764af942ac8c82a1d379/image.png?expires=1772540100&amp;signature=936cb467aa8262b8fa463c3fbb389fe68ab20acb7720e8e0e2d1dd84ea5ce690&amp;req=dSgvE8p%2Bn4BZXfMW1HO4zbcdX%2F0sEXI2%2BwEYwydYdHKyRYlrJ%2F6gbB6ewFBr%0AZyguTL1YACzdanYz%2FbA%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot interface with a "Take-Profits Ratios" section. At the top, there are two tabs—"Channel" (unselected) and "Personal" (selected, blue). Below, three buttons—"Built-in", "Custom", and "DCA" (DCA is highlighted in blue). An "Amount Scale" section includes a slider (set to 1) and a checkbox labeled "Only use if not defined by group".\n\n---\n\n### Изображение 4\n\n![Image 4](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885472638/bd1095c88f639f323a6b2853d755/image.png?expires=1772540100&amp;signature=03cc8b13b801f27c445cfa53bb6759797aa833b789950c3556d8f2134bff7fdc&amp;req=dSgvE815n4dcUfMW1HO4zbpnACY%2BhLjPEfwBTOMJnSnV0RfyK%2BNyIWmJK36I%0ATnsk4qlX0IrtE1rbsLg%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885472638/bd1095c88f639f323a6b2853d755/image.png?expires=1772540100&amp;signature=03cc8b13b801f27c445cfa53bb6759797aa833b789950c3556d8f2134bff7fdc&amp;req=dSgvE815n4dcUfMW1HO4zbpnACY%2BhLjPEfwBTOMJnSnV0RfyK%2BNyIWmJK36I%0ATnsk4qlX0IrtE1rbsLg%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot UI with a "First Take-Profit Distance" setting, featuring an info icon, a "Channel" dropdown (set to "Personal"), and a numerical input field displaying "5" with a "%" label. The design uses a clean, minimalistic layout with blue and gray color tones for buttons and text.\n\n---\n\n### Изображение 5\n\n![Image 5](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885475053/a5181f29ae103d258f997b796fa0/image.png?expires=1772540100&amp;signature=9ad7714fcc0d97efbbd214b07d2f36daa47d50d91fe02a10079ed43036554b05&amp;req=dSgvE815mIFaWvMW1HO4zZGK7Y4kPuv7lMibWwZdtTcqfRubbTSxGBJh7WZa%0AWybOmnz6vDRg8xNWTEI%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885475053/a5181f29ae103d258f997b796fa0/image.png?expires=1772540100&amp;signature=9ad7714fcc0d97efbbd214b07d2f36daa47d50d91fe02a10079ed43036554b05&amp;req=dSgvE815mIFaWvMW1HO4zZGK7Y4kPuv7lMibWwZdtTcqfRubbTSxGBJh7WZa%0AWybOmnz6vDRg8xNWTEI%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot interface with two labeled sliders: "Price Difference" (set to 1%) and "Price Scale" (set to 2), each with info icons. Above the sliders, there’s a "Take-Profits Prices" header, a "Channel" label, and a blue "Personal" button.\n\n---\n\n### Изображение 6\n\n![Image 6](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885480124/60e29387a55407dfb0d639360da8/image.png?expires=1772540100&amp;signature=8003fd2a7ee6209bdfd47cc0d1a356018039ffdc0b0b19841d9c41013e4131e1&amp;req=dSgvE812nYBdXfMW1HO4zUCJoPARih8vyIzGRCuBpmPcNCg9uNttc8DrR7Tw%0AcJX9gjsBd1SdqVGiVb8%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885480124/60e29387a55407dfb0d639360da8/image.png?expires=1772540100&amp;signature=8003fd2a7ee6209bdfd47cc0d1a356018039ffdc0b0b19841d9c41013e4131e1&amp;req=dSgvE812nYBdXfMW1HO4zUCJoPARih8vyIzGRCuBpmPcNCg9uNttc8DrR7Tw%0AcJX9gjsBd1SdqVGiVb8%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot interface with a **trailing stop** toggle (currently "Off") and a "Channel" vs. "Personal" selection (with "Personal" highlighted in blue). Below, a dropdown displays "10%", and a checkbox labeled "Only use if not defined by group" is unchecked, accompanied by an info icon.\n\n---\n\n### Изображение 7\n\n![Image 7](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885544237/7676e145d890d6e66613f1de16b5/image.png?expires=1772540100&amp;signature=5eee89824d9c65dbd259523e846130dce76f98b5d5607e1a4dc424c1558e2d7f&amp;req=dSgvE8x6mYNcXvMW1HO4zf4TyTtfQ5knW5u8j3O5KC9%2BTCtrAMTpfDawxM7q%0AJZ84u4nK9he8Rk0p%2F0E%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1885544237/7676e145d890d6e66613f1de16b5/image.png?expires=1772540100&amp;signature=5eee89824d9c65dbd259523e846130dce76f98b5d5607e1a4dc424c1558e2d7f&amp;req=dSgvE8x6mYNcXvMW1HO4zf4TyTtfQ5knW5u8j3O5KC9%2BTCtrAMTpfDawxM7q%0AJZ84u4nK9he8Rk0p%2F0E%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot UI section with a "Max Number of Orders" label, an info icon, a "Channel" label, a "Personal" button, a blue slider, and a text box displaying "5". The slider and text box are aligned horizontally, with the slider to the left of the text box.\n\n---\n\n### Изображение 8\n\n![Image 8](https://downloads.intercomcdn.com/i/o/wrsw0nb0/663085/66f657d34c477c0cb5e0ad55a357/811b89d422741a7d1e34bcfcff4f39f0.png)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/663085/66f657d34c477c0cb5e0ad55a357/811b89d422741a7d1e34bcfcff4f39f0.png\n\n**Описание:** The screenshot displays the Cornix trading bot’s logo, featuring a stylized dark blue crow holding a small yellow object (likely a coin) in its beak, positioned above the lowercase text “cornix” in a matching dark blue font. The design is clean and minimalist, with the crow perched on a subtle curved line beneath the text, emphasizing the brand’s visual identity.\n\n---\n\n### Изображение 9\n\n![Image 9](https://static.intercomassets.com/avatars/5322994/square_128/IMG-20230206-WA0000_%281%29-1678375300.jpeg)\n\n**URL:** https://static.intercomassets.com/avatars/5322994/square_128/IMG-20230206-WA0000_%281%29-1678375300.jpeg\n\n**Описание:** The screenshot shows a Cornix trading bot interface with a dark-themed UI, featuring a navigation bar at the top with menu options (e.g., "Dashboard," "Strategies," "Signals"), a central panel displaying trading strategy details (like "BTC/USD Long" with profit/loss metrics), and a sidebar with quick-access tools (e.g., "New Bot," "History"). The layout is clean, with a focus on real-time trading data and actionable controls for managing automated strategies.\n\n---\n\n

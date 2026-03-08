# Signals Bot Advanced Settings - General Section

**URL:** https://help.cornix.io/en/articles/8975691-signals-bot-advanced-settings-general-section

**Created:** 2026-03-03T11:46:51+00:00

---

Signals Bot Advanced Settings - General Section | Cornix Help Center- - - - - - :root{--body-bg: rgb(255, 255, 255);
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
Amount Per TradeOnly use if not defined by groupSymbolsDirectionLeverageOnly use if not defined by group- All Collections
- Trading Bots
- Signals
- Signals Bots Advanced Settings
- Signals Bot Advanced Settings - General Section
# Signals Bot Advanced Settings - General Section
Written by Hadar Cornix Updated over 3 months agoTable of contents
Amount Per TradeOnly use if not defined by groupSymbolsDirectionLeverageOnly use if not defined by group
The advanced general settings enhance the essential bot information (Signals Group, Exchange Account, and Amount Per Trade) by adding a Symbols drop-down to filter specific pairs, as well as Direction and Leverage settings, giving you greater control over the bot's preferences.

Screenshot: Click "Advanced Settings" to enable them


# Amount Per Trade
The amount per trade is configurable in the basic settings as well, opening the advanced settings adds the option to use the amount per trade only if not set by the channel.

## Only use if not defined by group
Selecting the "Only use if not defined by group" checkbox below the amount per trade tab will enable the chosen amount per trade value to be used as a fallback only when the amount per trade is not specified in the posted signal. If it is defined in the signal, the bot will use the value set in the group configuration.

# Symbols
You can determine which trading pairs your bot will trade or not. Only signals for pairs allowed by you will trigger trades by the bot. The default setting allows all pairs, while you can remove the checkmark from a specific symbol to "blacklist" it from the bot (even if a signal for this pair is published in the channel, the bot won't open a trade for it). Alternatively, you can deselect all and then check the box for the specific pairs you want this bot to trade.

For futures exchanges, you can set the Direction (Long/Short filter) and specify your preferred Leverage:

# Direction
Customize your bot's trading direction by selecting long or short. You can enable or disable the execution of long (regular) and short (reversed) trades, or both. For instance, if you enable only long trades, the bot will act solely on long signals, disregarding short signals.

# Leverage
You have full flexibility to customize the Margin Type (Isolated or Cross) and Multiplier (leverage level) for each symbol.

By choosing the channel option, the system will apply the channel preferences for each signal.

To override the channel's leverage configuration, use the personal settings. To configure leverage settings for specific symbols, check the box next to each symbol you wish to edit, or use the select all option and then deselect symbols you don't want to edit, if any. After selecting the desired symbols, choose between Isolated and Cross and set the multiplier for each symbol.

When setting the multiplier you can set it to 'Exactly" or 'Up To':
-
Exactly will use exactly the multiplier you set.
-
Up To will take any leverage that was set by the channel up to the limit you set, allowing you to use the channel preferences up to a certain limit defined by you.
If choosing a multiplier that is higher than the maximum multiplier allowed by the exchange do a specific symbol, the symbols will adjusted to the maximum that is allowed on the exchange.

## Only use if not defined by group
When setting personal preferences to leverage, selecting the "Only use if not defined by group" checkbox will enable the chosen leverage values to be used as a fallback only when the leverage is not specified in the posted signal. If the signal defines the leverage, the bot will use the value set in the group configuration.
Did this answer your question?😞😐😃Cornix Help Center-
-
-
-
Intercom
We run on Intercom
window.intercomSettings = {"app_id":"wrsw0nb0","article_id":"8975691","anonymous_id":"125fd043-744d-4403-84b4-05d5dbd1925e"};
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
\n\n---\n\n## Изображения\n\n### Изображение 1\n\n![Image 1](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883904579/0952ade82dc4360680478f112961/image.png?expires=1772540100&amp;signature=cc3175e9caaf978c336c5af01644991a16d3de385b1236422fc5ee58a923f0e8&amp;req=dSgvFcB%2BmYRYUPMW1HO4zZPOAge8ar3MJ4DTdo2b1B9epkSiJCXS9wfPU1h6%0ANEmUUbkxnvp%2Blhb3qAs%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883904579/0952ade82dc4360680478f112961/image.png?expires=1772540100&amp;signature=cc3175e9caaf978c336c5af01644991a16d3de385b1236422fc5ee58a923f0e8&amp;req=dSgvFcB%2BmYRYUPMW1HO4zZPOAge8ar3MJ4DTdo2b1B9epkSiJCXS9wfPU1h6%0ANEmUUbkxnvp%2Blhb3qAs%3D%0A\n\n**Описание:** The screenshot shows a Cornix trading bot interface with an "Available Balance" of 79480.3 USD and a "Bot Amount Value" of 5000 USD (6.29%). It includes two buttons—"Advanced Settings" and "Backtesting"—and a prominent blue "Create Bot" button at the bottom.\n\n---\n\n### Изображение 2\n\n![Image 2](https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883908596/f102f3b158994fa3181433cafbd4/image.png?expires=1772540100&amp;signature=ae5e75f17941cfd99554fc3a089304e63b6d114ba496a311f14e0312df4a22a7&amp;req=dSgvFcB%2BlYRWX%2FMW1HO4zYzkCA58iBhrFTnq1z3m9hGQ5LC3CKHL6cMTSnqM%0Amxo17hCDa8sLLLCgZDo%3D%0A)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/1883908596/f102f3b158994fa3181433cafbd4/image.png?expires=1772540100&amp;signature=ae5e75f17941cfd99554fc3a089304e63b6d114ba496a311f14e0312df4a22a7&amp;req=dSgvFcB%2BlYRWX%2FMW1HO4zYzkCA58iBhrFTnq1z3m9hGQ5LC3CKHL6cMTSnqM%0Amxo17hCDa8sLLLCgZDo%3D%0A\n\n**Описание:** The screenshot shows the "General" tab of the Cornix trading bot interface, with a navigation bar at the top containing tabs like "Entries," "Take-Profits," "Stop," and "Advanced." Below, form fields include "Bot Name" (set to "Test Group Signals Bot"), "Signals Group" (dropdown with "Test Group"), "Account" (dropdown with "My Binance Futures"), "Symbols" (dropdown with crypto icons), "Amount Per Trade" (5000 USD, fixed), "Direction" (dropdown with "Long" and "Short" options), and "Leverage" (tabs for "Channel" and "Personal").\n\n---\n\n### Изображение 3\n\n![Image 3](https://downloads.intercomcdn.com/i/o/wrsw0nb0/663085/66f657d34c477c0cb5e0ad55a357/811b89d422741a7d1e34bcfcff4f39f0.png)\n\n**URL:** https://downloads.intercomcdn.com/i/o/wrsw0nb0/663085/66f657d34c477c0cb5e0ad55a357/811b89d422741a7d1e34bcfcff4f39f0.png\n\n**Описание:** The screenshot displays the Cornix trading bot’s logo, featuring a stylized dark blue crow holding a small yellow object (likely a coin) in its beak, perched on a curved line above the brand name “cornix” in bold, dark blue lowercase letters. The design is minimalistic, with a white background emphasizing the logo’s clean, professional aesthetic.\n\n---\n\n### Изображение 4\n\n![Image 4](https://static.intercomassets.com/avatars/5322994/square_128/IMG-20230206-WA0000_%281%29-1678375300.jpeg)\n\n**URL:** https://static.intercomassets.com/avatars/5322994/square_128/IMG-20230206-WA0000_%281%29-1678375300.jpeg\n\n**Описание:** The screenshot displays a Cornix trading bot interface, featuring a clean, modern layout with a dark-themed background. Key UI elements include a navigation bar at the top with tabs (likely for "Dashboard," "Trading," "Settings," etc.), a central panel showing trading metrics (e.g., profit/loss, active bots), and a sidebar with quick-access options like "Start Bot," "Stop Bot," or "Edit Strategy." The design emphasizes clarity, with distinct sections for monitoring and controlling automated trading activities.\n\n---\n\n

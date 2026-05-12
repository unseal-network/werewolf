1、@apps/web修改框架为 react + tailwindcss + lucide-react
2、游戏结束后需要关掉语音，结束后添加返回按钮，返回到游戏点击开始的界面，可以继续开始游戏
3、参考/Users/ranjun/Desktop/Works/me/document-demo/works/unseal/unseal-web/games/packages/wolf，UI使用，获取用户及token这些，需要使用iframeMessage，具体如下
（1）加载页面参考 /Users/ranjun/Desktop/Works/me/document-demo/works/unseal/unseal-web/games/packages/wolf/src/game-view/LobbyLoading.tsx
（2）游戏创建参考/Users/ranjun/Desktop/Works/me/document-demo/works/unseal/unseal-web/games/packages/wolf/src/game-view/GameMobileReady.tsx
（3）游戏界面参考/Users/ranjun/Desktop/Works/me/document-demo/works/unseal/unseal-web/games/packages/wolf/src/game-view/mobile/GameMobileBody.tsx
api使用现在的server
4、图片可以用 /Users/ranjun/Desktop/Works/me/document-demo/works/unseal/unseal-web/games/packages/wolf/src/assets，拷贝过来就好
5、只有管理者可以添加AI
6、玩家坐下后需要点击准备，全部准备好后，admin才能开始游戏
先给我优化文档，
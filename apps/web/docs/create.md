


1、进入游戏init需要调用 POST http://localhost:12018/api/auth/enter

header中传入
{
    unsealToken: string
}
返回参数 {
    "user": {
        "userId": "@jams2026:keepsecret.io",
        "displayName": "Jams2026",
        "avatarUrl": "mxc://keepsecret.io/RZWRjWiKUfQuemYUUaxRxsZX"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJAamFtczIwMjY6a2VlcHNlY3JldC5pbyIsImlhdCI6MTc3ODY1ODQwMSwiZXhwIjoxNzc5MjYzMjAxfQ._QoNKhAxK1UwDNWToIrYllmbrG7QEK6b1f9Z-9A8eUw"
}

主要是这个token，记录本地，记下来接口 headers中使用 Authorization （游戏中其他接口不变）

http://localhost:12018/api/rooms/{gameInfo.gameRoomId}
返回数据{
    "success": true,
    "data": {
        "roomId": "8530edac-3ea9-4e56-bb64-f06a892765c7",
        "meetId": "!HhCuYUBxUadqXojuTY:keepsecret.io",
        "status": "waiting",
        "playerCount": null,
        "currentPlayers": 0,
        "mode": "standard",
        "lang": "zh",
        "adminId": "@jams2026:keepsecret.io",
        "creatorId": "@jams2026:keepsecret.io",
        "refereeId": null,
        "gameAppId": 11,
        "linkRoomId": "661e8400-e29b-41d4-a716-446655440002",
        "isMine": true,
        "players": []
    }
}
如果linkRoomId 存在，则进入游戏，不用创建，如果不存在，判断
（1）自己是管理员，去创建房间
（2）不是管理员，间隔1s进行查询，是否房间已经创建完成，完成后直接进入游戏


2、创建游戏修改
@apps/web/src/pages/LobbyPage.tsx handleCreateAndJoin 接口 onCreateAndJoin 成功后需要盘钝gemeInfo是否存在，存在就要调用接口
http://locahost:12018/api/rooms/:roomId/link，roomId为gemeInfo.gameRoomId
body参数 {
    linkRoomId: "661e8400-e29b-41d4-a716-446655440002"
}
返回参数
{
    "success": true,
    "data": {
        "roomId": "8530edac-3ea9-4e56-bb64-f06a892765c7",
        "linkRoomId": "661e8400-e29b-41d4-a716-446655440002"
    }
}
调用成功后才是创建成功

先给我优化文档
var Errors = require('../lib/Errors');
var uuid = require('node-uuid');

exports.list = function(req, res, next) {
    var user_id = req.query.userid;
    req.db.driver.execQuery(
        "SELECT appointment.id as reservation_id, appointment.price as price,appointment.status as status, " +
        "appointment.time as time,doctor.name as doctor_name,hospital.name as hospital_name,department.name as department_name "+
        "FROM appointment,doctor,department,hospital "+
        "WHERE appointment.user_id=? "+
        "AND appointment.doctor_id=doctor.id "+
        "AND doctor.department_id=department.id "+
        "AND department.hospital_id=hospital.id",
        [user_id],
        function (err, data) {
            if(err && err.message != 'Not found') return next(err);
            if(!data) {
                return next(new Errors.EmptyReservation("You Don't Have Any Appointment!"));
            }
            for(var i = 0; i < data.length; i++){
                data[i]['status_msg']=parseStatus(data[i]['status']);
            }
            res.json({
                code: 0,
                message: 'success',
                reservations: data
            });
        });
};

exports.list_h = function(req, res, next) {
    var hospital_id = req.params.hospitalId;
    req.db.driver.execQuery(
        "SELECT appointment.id as reservation_id, appointment.price as price,appointment.status as status,user.realname as user_name, " +
        "appointment.time as time,doctor.name as doctor_name,hospital.name as hospital_name,department.name as department_name "+
        "FROM appointment,doctor,department,hospital,user "+
        "WHERE appointment.doctor_id=doctor.id "+
        "AND doctor.department_id=department.id AND department.hospital_id=hospital.id "+
        "AND hospital.id = ? AND appointment.user_id = user.id",
        [hospital_id],
        function (err, data) {
            if(err && err.message != 'Not found') return next(err);
            if(!data) {
                return next(new Errors.EmptyReservation("You Don't Have Any Appointment!"));
            }
            else{
                for(var i = 0; i < data.length; i++){
                    data[i]['status_msg']=parseStatus(data[i]['status']);
                }
                res.json({
                    code: 0,
                    message: 'success',
                    reservations: data
                });
            }
        });
};

exports.add = function(req, res, next) {
    var auser_id=req.body.user_id;
    var ahospital_id=req.body.hospital_id;
    var adepartment_id=req.body.department_id;
    var adoctor_id=req.body.doctor_id;
    var adate=req.body.date;
    var aggdate='%'+adate.substr(8,2);
    var aweeknum=(function() {
        switch(req.body.week) {
            case '星期一':
                return 1;
            case '星期二':
                return 2;
            case '星期三':
                return 3;
            case '星期四':
                return 4;
            case '星期五':
                return 5;
            case '星期六':
                return 6;
            case '星期日':
                return 7;
        }
    })();
    var aperiod=req.body.period == 'morning' ? 1 : (req.body.period == 'afternoon' ? 2 : 3);
    var afrequency1="00000000";
    var afrequency2="10000000";
    var afrequency3="2_______";
    var afrequency4="30000000";
    afrequency3 = afrequency3.replaceAt(aweeknum, '1');
    req.models.user.get(auser_id,function(err,user){
        if(err && err.message != 'Not found') return next(err);
        if(!user) return next(new Errors.ReservationUserInvalidFailure('User Not Exist!'));
        else{
            req.db.driver.execQuery("SELECT COUNT(*) as number "+
                "FROM appointment "+
                "WHERE doctor_id=? "+
                "AND period=? "+
                "AND time=?",
                [adoctor_id,aperiod,adate],
                function(err,data){
                    if(err) return next(err);
                    if(!data) return next(new Errors.ReservationErrorFailure('Database Error!'));
                    req.db.driver.execQuery("SELECT total_app,price "+
                        "FROM working,doctor "+
                        "WHERE doctor_id=doctor.id "+
                        "AND doctor_id=? "+
                        "AND period=? "+
                        "AND (frequency=? "+
                        "OR frequency=? "+
                        "OR (frequency=? AND date like ?) "+
                        "OR frequency like ?) LIMIT 1",
                        [adoctor_id,aperiod,afrequency1,afrequency2,afrequency4,aggdate,afrequency3],
                        function(err,data1){
                            if(err && err.message != 'Not found') return next(err);
                            if(!data1) return next(new Errors.ReservationPeriodFailure('No Such Working Period!'));
                            if(data1[0]['total_app']<=data['number']){
                                return next(new Errors.ReservationFullFailure("Appointment Full!"));
                            }
                            else{
                                req.models.appointment.create({
                                    time:adate,
                                    period: aperiod,
                                    status: '000000',
                                    price: data1[0]['price'],
                                    running_number: uuid.v4(),
                                    user_id: auser_id,
                                    doctor_id: adoctor_id,
                                    record_time: new Date().Format('yyyy-MM-dd hh:mm:ss')
                                },function(error,item){
                                    if(error) throw error;
                                    res.json({
                                        code: 0,
                                        message: 'success',
                                        id: item.id
                                    });
                                });
                            }
                        });
                });
        }
    });
};

exports.cancel = function(req, res, next) {
    var reservation_id=req.params.reservationId;
    req.models.appointment.get(reservation_id,function(err,app){
        if(err && err.message != 'Not found') return next(err);
        if(!app) return next(new Errors.CancelFailure("Cannot Find Such Appointment!"));
        app.status = app.status.replaceAt(5, 0);
        app.save(function(err) {
            if(err && err.message != 'Not found') return next(err);
            res.json({
                code: 0,
                message: 'success'
            });
        });
    });
};

exports.pay = function(req, res, next) {
    var reservation_id=req.params.reservationId;
    req.models.appointment.get(reservation_id,function(err,app){
        if(err && err.message != 'Not found') return next(err);
        if(!app) return next(new Errors.PaymentFailure("Unable To Pay For Your Appointment!"));
        app.status = app.status.replaceAt(0, '1').replaceAt(1, '1');
        app.save(function(err){
            if(err && err.message != 'Not found') return next(err);
            res.json({
                code: 0,
                message: 'success'
            });
        });
    });
};

exports.detail = function(req, res, next) {
    var reservation_id=req.params.reservationId;
    req.db.driver.execQuery(
        "SELECT appointment.id AS reservation,appointment.time AS time,status,appointment.price AS price,record_time,"+
        "period,doctor.name as doctor_name,department.name as department_name,hospital.name as hospital_name, "+
        "doctor.id as doctor_id FROM appointment,doctor,department,hospital "+
        "WHERE appointment.id=? "+
        "AND appointment.doctor_id=doctor.id "+
        "AND doctor.department_id=department.id "+
        "AND department.hospital_id=hospital.id",
        [reservation_id],
        function(err,data){
            if(err && err.message != 'Not found') return next(err);
            if(!data) return next(new Errors.DetailFailure("No Such Appointment!"));
            res.json({
                code: 0,
                message: "success",
                reservation_id: data[0]['reservation'],
                date: data[0]['time'],
                period: data[0]['period']==1 ? 'morning' : (data[0]['period']==2 ? 'afternoon' : 'evening'),
                doctor_id: data[0]['doctor_id'],
                doctor_name: data[0]['doctor_name'],
                department_name: data[0]['department_name'],
                hospital_name: data[0]['hospital_name'],
                submission_date: data[0]['record_time'],
                price: data[0]['price'],
                status: data[0]['status'],
                status_msg: parseStatus(data[0]['status'])
            });
        });
};

exports.confirm = function(req, res, next) {
    var reservation_id=req.params.reservationId;
    req.models.appointment.get(reservation_id,function(err,app){
        if(err && err.message != 'Not found') return next(err);
        if(!app) return next(new Errors.ConfirmFailure("No Such Appointment!"));
        app.status=app.status.replaceAt(2, '2');
        app.save(function(err){
            if(err && err.message != 'Not found') return next(err);
            res.json({
                code: 0,
                message: "success"
            });
        });
    })
};

function parseStatus(code) {
    if(code.charAt(5) == '1') return '订单已取消';
    var ret = '';
    if(code.charAt(0) == '1') {
        ret += '在线支付';
        if(code.charAt(1) == '1') ret += '，已付款'; else ret += '，未付款';
    } else {
        ret += '现金支付';
    }
    switch(code.charAt(2)) {
        case '0':
            ret += '，未确认到场';
            break;
        case '1':
            ret += '，未到场';
            break;
        case '2':
            ret += '，确认到场';
            break;
    }
    if(code.charAt(3) == '1') ret += '，已超时';
    //if(code.charAt(4) == '1') ret += '，已被检察'; else ret += '，未被检查';
    return ret;
}
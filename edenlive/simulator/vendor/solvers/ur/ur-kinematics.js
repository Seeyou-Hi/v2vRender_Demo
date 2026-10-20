/*********************************************************************
 *
 * Provides forward and inverse kinematics for Univeral robot designs
 * Author: Kelsey Hawkins (kphawkins@gatech.edu)
 *
 * Software License Agreement (BSD License)
 *
 *  Copyright (c) 2013, Georgia Institute of Technology
 *  All rights reserved.
 *
 *  Redistribution and use in source and binary forms, with or without
 *  modification, are permitted provided that the following conditions
 *  are met:
 *
 *   * Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 *   * Redistributions in binary form must reproduce the above
 *     copyright notice, this list of conditions and the following
 *     disclaimer in the documentation and/or other materials provided
 *     with the distribution.
 *   * Neither the name of the Georgia Institute of Technology nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 *  "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 *  LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS
 *  FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 *  COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
 *  INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
 *  BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 *  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 *  CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 *  LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
 *  ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 *********************************************************************/

// JavaScript syntax port of upstream ur_kin.cpp, UR5 parameters.
const ZERO_THRESH=1e-8, PI=Math.PI,d1=.089159,a2=-.425,a3=-.39225,d4=.10915,d5=.09465,d6=.0823;
const {sin,cos,atan2,asin,acos,sqrt}=Math; const fabs=Math.abs; const SIGN=x=>(x>0)-(x<0);
  export function forward(q) { let qi=0,ti=0; const T=new Float64Array(16);
    let s1 = sin(q[qi]), c1 = cos(q[qi]); qi++;
    let q23 = q[qi], q234 = q[qi], s2 = sin(q[qi]), c2 = cos(q[qi]); qi++;
    let s3 = sin(q[qi]), c3 = cos(q[qi]); q23 += q[qi]; q234 += q[qi]; qi++;
    let s4 = sin(q[qi]), c4 = cos(q[qi]); q234 += q[qi]; qi++;
    let s5 = sin(q[qi]), c5 = cos(q[qi]); qi++;
    let s6 = sin(q[qi]), c6 = cos(q[qi]); 
    let s23 = sin(q23), c23 = cos(q23);
    let s234 = sin(q234), c234 = cos(q234);
    T[ti] = c234*c1*s5 - c5*s1; ti++;
    T[ti] = c6*(s1*s5 + c234*c1*c5) - s234*c1*s6; ti++;
    T[ti] = -s6*(s1*s5 + c234*c1*c5) - s234*c1*c6; ti++;
    T[ti] = d6*c234*c1*s5 - a3*c23*c1 - a2*c1*c2 - d6*c5*s1 - d5*s234*c1 - d4*s1; ti++;
    T[ti] = c1*c5 + c234*s1*s5; ti++;
    T[ti] = -c6*(c1*s5 - c234*c5*s1) - s234*s1*s6; ti++;
    T[ti] = s6*(c1*s5 - c234*c5*s1) - s234*c6*s1; ti++;
    T[ti] = d6*(c1*c5 + c234*s1*s5) + d4*c1 - a3*c23*s1 - a2*c2*s1 - d5*s234*s1; ti++;
    T[ti] = -s234*s5; ti++;
    T[ti] = -c234*s6 - s234*c5*c6; ti++;
    T[ti] = s234*c5*s6 - c234*c6; ti++;
    T[ti] = d1 + a3*s23 + a2*s2 - d5*(c23*c4 - s23*s4) - d6*s5*(c23*s4 + s23*c4); ti++;
    T[ti] = 0.0; ti++; T[ti] = 0.0; ti++; T[ti] = 0.0; ti++; T[ti] = 1.0;
 return T;
 }
  export function inverse(T,q6_des=0) {
    let num_sols = 0; const q_sols = new Float64Array(48); let ti=0;
    let T02 = -T[ti]; ti++; let T00 =  T[ti]; ti++; let T01 =  T[ti]; ti++; let T03 = -T[ti]; ti++; 
    let T12 = -T[ti]; ti++; let T10 =  T[ti]; ti++; let T11 =  T[ti]; ti++; let T13 = -T[ti]; ti++; 
    let T22 =  T[ti]; ti++; let T20 = -T[ti]; ti++; let T21 = -T[ti]; ti++; let T23 =  T[ti];

    ////////////////////////////// shoulder rotate joint (q1) //////////////////////////////
    let q1 = [0,0];
    {
      let A = d6*T12 - T13;
      let B = d6*T02 - T03;
      let R = A*A + B*B;
      if(fabs(A) < ZERO_THRESH) {
        let div;
        if(fabs(fabs(d4) - fabs(B)) < ZERO_THRESH)
          div = -SIGN(d4)*SIGN(B);
        else
          div = -d4/B;
        let arcsin = asin(div);
        if(fabs(arcsin) < ZERO_THRESH)
          arcsin = 0.0;
        if(arcsin < 0.0)
          q1[0] = arcsin + 2.0*PI;
        else
          q1[0] = arcsin;
        q1[1] = PI - arcsin;
      }
      else if(fabs(B) < ZERO_THRESH) {
        let div;
        if(fabs(fabs(d4) - fabs(A)) < ZERO_THRESH)
          div = SIGN(d4)*SIGN(A);
        else
          div = d4/A;
        let arccos = acos(div);
        q1[0] = arccos;
        q1[1] = 2.0*PI - arccos;
      }
      else if(d4*d4 > R) {
        return Array.from({length:num_sols},(_,i)=>Array.from(q_sols.slice(i*6,i*6+6)));
      }
      else {
        let arccos = acos(d4 / sqrt(R)) ;
        let arctan = atan2(-B, A);
        let pos = arccos + arctan;
        let neg = -arccos + arctan;
        if(fabs(pos) < ZERO_THRESH)
          pos = 0.0;
        if(fabs(neg) < ZERO_THRESH)
          neg = 0.0;
        if(pos >= 0.0)
          q1[0] = pos;
        else
          q1[0] = 2.0*PI + pos;
        if(neg >= 0.0)
          q1[1] = neg; 
        else
          q1[1] = 2.0*PI + neg;
      }
    }
    ////////////////////////////////////////////////////////////////////////////////

    ////////////////////////////// wrist 2 joint (q5) //////////////////////////////
    let q5 = [[0,0],[0,0]];
    {
      for(let i=0;i<2;i++) {
        let numer = (T03*sin(q1[i]) - T13*cos(q1[i])-d4);
        let div;
        if(fabs(fabs(numer) - fabs(d6)) < ZERO_THRESH)
          div = SIGN(numer) * SIGN(d6);
        else
          div = numer / d6;
        let arccos = acos(div);
        q5[i][0] = arccos;
        q5[i][1] = 2.0*PI - arccos;
      }
    }
    ////////////////////////////////////////////////////////////////////////////////

    {
      for(let i=0;i<2;i++) {
        for(let j=0;j<2;j++) {
          let c1 = cos(q1[i]), s1 = sin(q1[i]);
          let c5 = cos(q5[i][j]), s5 = sin(q5[i][j]);
          let q6;
          ////////////////////////////// wrist 3 joint (q6) //////////////////////////////
          if(fabs(s5) < ZERO_THRESH)
            q6 = q6_des;
          else {
            q6 = atan2(SIGN(s5)*-(T01*s1 - T11*c1), 
                       SIGN(s5)*(T00*s1 - T10*c1));
            if(fabs(q6) < ZERO_THRESH)
              q6 = 0.0;
            if(q6 < 0.0)
              q6 += 2.0*PI;
          }
          ////////////////////////////////////////////////////////////////////////////////

          let q2 = [0,0], q3=[0,0], q4=[0,0];
          ///////////////////////////// RRR joints (q2,q3,q4) ////////////////////////////
          let c6 = cos(q6), s6 = sin(q6);
          let x04x = -s5*(T02*c1 + T12*s1) - c5*(s6*(T01*c1 + T11*s1) - c6*(T00*c1 + T10*s1));
          let x04y = c5*(T20*c6 - T21*s6) - T22*s5;
          let p13x = d5*(s6*(T00*c1 + T10*s1) + c6*(T01*c1 + T11*s1)) - d6*(T02*c1 + T12*s1) + 
                        T03*c1 + T13*s1;
          let p13y = T23 - d1 - d6*T22 + d5*(T21*c6 + T20*s6);

          let c3 = (p13x*p13x + p13y*p13y - a2*a2 - a3*a3) / (2.0*a2*a3);
          if(fabs(fabs(c3) - 1.0) < ZERO_THRESH)
            c3 = SIGN(c3);
          else if(fabs(c3) > 1.0) {
            // TODO NO SOLUTION
            continue;
          }
          let arccos = acos(c3);
          q3[0] = arccos;
          q3[1] = 2.0*PI - arccos;
          let denom = a2*a2 + a3*a3 + 2*a2*a3*c3;
          let s3 = sin(arccos);
          let A = (a2 + a3*c3), B = a3*s3;
          q2[0] = atan2((A*p13y - B*p13x) / denom, (A*p13x + B*p13y) / denom);
          q2[1] = atan2((A*p13y + B*p13x) / denom, (A*p13x - B*p13y) / denom);
          let c23_0 = cos(q2[0]+q3[0]);
          let s23_0 = sin(q2[0]+q3[0]);
          let c23_1 = cos(q2[1]+q3[1]);
          let s23_1 = sin(q2[1]+q3[1]);
          q4[0] = atan2(c23_0*x04y - s23_0*x04x, x04x*c23_0 + x04y*s23_0);
          q4[1] = atan2(c23_1*x04y - s23_1*x04x, x04x*c23_1 + x04y*s23_1);
          ////////////////////////////////////////////////////////////////////////////////
          for(let k=0;k<2;k++) {
            if(fabs(q2[k]) < ZERO_THRESH)
              q2[k] = 0.0;
            else if(q2[k] < 0.0) q2[k] += 2.0*PI;
            if(fabs(q4[k]) < ZERO_THRESH)
              q4[k] = 0.0;
            else if(q4[k] < 0.0) q4[k] += 2.0*PI;
            q_sols[num_sols*6+0] = q1[i];    q_sols[num_sols*6+1] = q2[k]; 
            q_sols[num_sols*6+2] = q3[k];    q_sols[num_sols*6+3] = q4[k]; 
            q_sols[num_sols*6+4] = q5[i][j]; q_sols[num_sols*6+5] = q6; 
            num_sols++;
          }

        }
      }
    }
    return Array.from({length:num_sols},(_,i)=>Array.from(q_sols.slice(i*6,i*6+6)));
  }